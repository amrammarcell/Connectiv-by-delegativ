"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ensureUser } from "@/lib/accounts";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { metaAdsEnv } from "@/lib/env.server";
import { syncAdAccount } from "@/lib/meta-ads/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { SLUG_PATTERN } from "@/lib/text";
import { processPendingEvents } from "@/lib/whatsapp/processor";
import type { FormState } from "@/app/actions/auth";

export type CreateWorkspaceState = {
  error?: string;
  created?: { nama: string; slug: string; ownerEmail: string; tempPassword: string | null };
};

const schema = z.object({
  nama: z.string().trim().min(1, "Nama workspace wajib diisi.").max(80),
  slug: z.string().trim().regex(SLUG_PATTERN, "Slug hanya huruf kecil, angka, dan tanda hubung.").max(48),
  ownerEmail: z.email({ error: "Email Owner tidak valid." }).transform((v) => v.toLowerCase()),
  ownerNama: z.string().trim().max(80).optional().transform((v) => v || null),
});

export async function createWorkspace(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  await requireSuperAdmin();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { nama, slug, ownerEmail, ownerNama } = parsed.data;

  // Insert lewat sesi Super Admin: RLS mengizinkan, trigger membuat stage default.
  const supabase = await createClient();
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({ nama, slug })
    .select("id")
    .single<{ id: string }>();
  if (error || !workspace) {
    return { error: error?.code === "23505" ? `Slug "${slug}" sudah dipakai.` : "Gagal membuat workspace." };
  }

  let owner;
  try {
    owner = await ensureUser(ownerEmail, ownerNama);
  } catch {
    return { error: "Workspace dibuat, tetapi akun Owner gagal dibuat. Tambahkan Owner dari Pengaturan workspace." };
  }

  const { error: memberError } = await supabase
    .from("memberships")
    .insert({ user_id: owner.userId, workspace_id: workspace.id, peran: "owner" });
  if (memberError) {
    return { error: "Workspace dibuat, tetapi Owner gagal ditambahkan. Tambahkan dari Pengaturan workspace." };
  }

  refresh();
  return { created: { nama, slug, ownerEmail, tempPassword: owner.tempPassword } };
}

const numberSchema = z.object({
  workspaceId: z.uuid({ error: "Pilih workspace." }),
  label: z.string().trim().min(1, "Label wajib diisi.").max(60),
  nomorTampil: z.string().trim().max(30).optional().transform((v) => v || null),
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "Phone Number ID hanya angka."),
  wabaId: z.string().trim().regex(/^\d{5,30}$/, "WABA ID hanya angka."),
  csPemilik: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
});

export async function addWaNumber(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();

  const parsed = numberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { workspaceId, label, nomorTampil, phoneNumberId, wabaId, csPemilik } = parsed.data;

  const supabase = await createClient();
  if (csPemilik) {
    const { data: member } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", csPemilik)
      .maybeSingle();
    if (!member) return { error: "CS pemilik bukan anggota workspace itu." };
  }
  // wa_numbers tidak bisa ditulis lewat sesi user (hak kolom dicabut), jadi
  // ditulis dengan secret key setelah requireSuperAdmin di atas.
  const admin = createAdminClient();
  const { error } = await admin.from("wa_numbers").insert({
    workspace_id: workspaceId,
    label,
    nomor_tampil: nomorTampil,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    cs_pemilik: csPemilik,
  });
  if (error) {
    console.error("addWaNumber", error.code, error.message);
    return { error: error.code === "23505" ? "Phone Number ID ini sudah terdaftar." : "Gagal menambah nomor." };
  }

  // Webhook yang sempat tertunda karena nomor ini belum terdaftar.
  const result = await processPendingEvents(admin, { deadline: Date.now() + 60_000 });
  refresh();
  return {
    success: `Nomor ${label} ditambahkan.${result.inserted ? ` ${result.inserted} pesan tertunda berhasil diproses.` : ""}`,
  };
}

const adAccountSchema = z.object({
  workspaceId: z.uuid({ error: "Pilih workspace." }),
  metaAdAccountId: z
    .string()
    .trim()
    .transform((v) => (v.startsWith("act_") ? v : `act_${v}`))
    .pipe(z.string().regex(/^act_\d{5,30}$/, "ID ad account hanya angka (boleh diawali act_).")),
  nama: z.string().trim().max(80).optional().transform((v) => v || null),
});

export async function addAdAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const parsed = adAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.from("ad_accounts").insert({
    workspace_id: parsed.data.workspaceId,
    meta_ad_account_id: parsed.data.metaAdAccountId,
    nama: parsed.data.nama,
  });
  if (error) {
    return { error: error.code === "23505" ? "Ad account ini sudah terdaftar di workspace itu." : "Gagal menambah ad account." };
  }
  refresh();
  return { success: `Ad account ${parsed.data.metaAdAccountId} ditambahkan. Klik Sync sekarang untuk menarik data.` };
}

export async function syncAdAccountNow(adAccountId: string): Promise<FormState> {
  await requireSuperAdmin();
  const env = metaAdsEnv();
  if (!env.META_ADS_ACCESS_TOKEN) return { error: "META_ADS_ACCESS_TOKEN belum diisi di environment variable." };

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("ad_accounts")
    .select("id, workspace_id, meta_ad_account_id")
    .eq("id", adAccountId)
    .maybeSingle();
  if (!account) return { error: "Ad account tidak ditemukan." };

  try {
    const result = await syncAdAccount(createAdminClient(), account, env.META_ADS_ACCESS_TOKEN, {
      graphVersion: env.META_GRAPH_VERSION,
    });
    refresh();
    return { success: `Sync selesai: ${result.rows} baris data harian.` };
  } catch (err) {
    refresh();
    return { error: err instanceof Error ? err.message : "Sync gagal." };
  }
}

// Tombol "Proses ulang" di pemantauan webhook /admin. Dibatasi waktu supaya
// tidak melewati maxDuration halaman; sisa event bisa diproses dengan klik lagi.
export async function reprocessWebhooks(): Promise<FormState> {
  await requireSuperAdmin();
  try {
    const r = await processPendingEvents(createAdminClient(), { deadline: Date.now() + 240_000 });
    refresh();
    if (!r.events) return { success: "Tidak ada webhook tertunda." };
    const parts = [
      `${r.events} webhook diperiksa: ${r.processed} selesai`,
      r.failed ? `${r.failed} gagal` : null,
      `${r.inserted} pesan baru`,
      r.edited || r.revoked ? `${r.edited} diedit, ${r.revoked} ditarik` : null,
      r.unknownNumbers.length ? `nomor belum terdaftar: ${r.unknownNumbers.join(", ")}` : null,
      r.timedOut ? "sebagian masih tersisa, klik lagi" : null,
    ];
    return { success: parts.filter(Boolean).join(" · ") + "." };
  } catch (err) {
    refresh();
    return { error: err instanceof Error ? err.message : "Proses ulang gagal." };
  }
}
