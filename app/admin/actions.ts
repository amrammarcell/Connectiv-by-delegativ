"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ensureUser } from "@/lib/accounts";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
});

export async function addWaNumber(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();

  const parsed = numberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { workspaceId, label, nomorTampil, phoneNumberId, wabaId } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("wa_numbers").insert({
    workspace_id: workspaceId,
    label,
    nomor_tampil: nomorTampil,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
  });
  if (error) {
    return { error: error.code === "23505" ? "Phone Number ID ini sudah terdaftar." : "Gagal menambah nomor." };
  }

  // Webhook yang sempat tertunda karena nomor ini belum terdaftar.
  const result = await processPendingEvents(createAdminClient());
  refresh();
  return {
    success: `Nomor ${label} ditambahkan.${result.inserted ? ` ${result.inserted} pesan tertunda berhasil diproses.` : ""}`,
  };
}
