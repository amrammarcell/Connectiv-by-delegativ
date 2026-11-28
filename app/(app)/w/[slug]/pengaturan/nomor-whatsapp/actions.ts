"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/actions/auth";
import { requireWorkspace } from "@/lib/auth";
import { techProviderEnv, type TechProviderEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GraphError } from "@/lib/whatsapp/graph";
import {
  OnboardingError,
  onboardWaba,
  runPendingSyncs,
  supabaseOnboardingStore,
  type TechProviderConfig,
} from "@/lib/whatsapp/onboarding";
import { processPendingEvents } from "@/lib/whatsapp/processor";

function configFrom(env: TechProviderEnv): TechProviderConfig {
  return {
    appId: env.META_APP_ID,
    appSecret: env.WHATSAPP_APP_SECRET,
    encryptionKey: env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
    graph: { graphVersion: env.META_GRAPH_VERSION },
  };
}

const signupSchema = z.object({
  code: z.string().trim().min(10).max(2048),
  wabaId: z.string().trim().regex(/^\d{5,30}$/),
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/)
    .nullish()
    .transform((v) => v ?? null),
});

export type SignupInput = z.input<typeof signupSchema>;

// Dipanggil tombol "Tambah nomor WhatsApp" setelah Embedded Signup selesai.
// Hanya Owner workspace atau Super Admin.
export async function completeEmbeddedSignup(slug: string, input: SignupInput): Promise<FormState> {
  const access = await requireWorkspace(slug);
  if (!access.canManage) return { error: "Hanya Owner yang bisa menambah nomor WhatsApp." };
  const env = techProviderEnv();
  if (!env) return { error: "Penyambungan nomor lewat jalur resmi belum aktif." };

  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: "Data dari Meta tidak lengkap. Ulangi penyambungan." };

  // wa_numbers dan token ditulis dengan secret key setelah cek akses di atas
  // (sesi user tidak punya hak insert; token tidak boleh terbaca user).
  const admin = createAdminClient();
  const store = supabaseOnboardingStore(admin);
  const config = configFrom(env);

  let numbers;
  try {
    ({ numbers } = await onboardWaba(store, {
      workspaceId: access.workspace.id,
      userId: access.user.id,
      ...parsed.data,
    }, config));
  } catch (err) {
    console.error("embedded signup", err instanceof Error ? err.message : err);
    if (err instanceof OnboardingError) return { error: err.message };
    if (err instanceof GraphError && err.message.includes("oauth/access_token")) {
      return { error: "Kode dari Meta sudah kedaluwarsa atau tidak valid. Ulangi penyambungan." };
    }
    return { error: "Gagal menyambungkan nomor. Coba lagi beberapa saat lagi." };
  }

  // Sinkronisasi kontak lalu riwayat (wajib dalam 24 jam). Kegagalan dicatat
  // di wa_numbers dan bisa diulang dari halaman ini atau cron harian.
  const syncs = await runPendingSyncs(store, config, numbers.map((n) => n.id)).catch((err: unknown) => {
    console.error("smb_app_data", err instanceof Error ? err.message : err);
    return [];
  });
  // Webhook yang tertunda karena nomornya belum terdaftar.
  await processPendingEvents(admin, { deadline: Date.now() + 60_000 }).catch(() => null);

  refresh();
  const labels = numbers.map((n) => n.label).join(", ");
  const failed = syncs.some((s) => s.status === "gagal");
  return {
    success: `Nomor ${labels} tersambung.${failed ? " Sinkronisasi belum berhasil; klik Coba lagi." : " Kontak dan riwayat chat sedang disinkronkan."}`,
  };
}

export async function retryNumberSync(slug: string, waNumberId: string): Promise<FormState> {
  const access = await requireWorkspace(slug);
  if (!access.canManage) return { error: "Tidak diizinkan." };
  const env = techProviderEnv();
  if (!env) return { error: "Jalur resmi belum aktif." };
  if (!z.uuid().safeParse(waNumberId).success) return { error: "Nomor tidak valid." };

  // Pastikan nomor milik workspace ini (lewat sesi user + RLS).
  const supabase = await createClient();
  const { data: number } = await supabase
    .from("wa_numbers")
    .select("id")
    .eq("id", waNumberId)
    .eq("workspace_id", access.workspace.id)
    .maybeSingle();
  if (!number) return { error: "Nomor tidak ditemukan." };

  const outcomes = await runPendingSyncs(supabaseOnboardingStore(createAdminClient()), configFrom(env), [waNumberId]);
  refresh();
  const failed = outcomes.find((o) => o.status !== "diminta");
  if (failed?.status === "kedaluwarsa") return { error: "Batas 24 jam sudah lewat. Sambungkan ulang nomor." };
  if (failed) return { error: `Sinkronisasi gagal: ${failed.error ?? "coba lagi nanti"}` };
  return { success: outcomes.length ? "Sinkronisasi diminta." : "Tidak ada sinkronisasi yang perlu diminta." };
}

const updateSchema = z.object({
  label: z.string().trim().min(1, "Label wajib diisi.").max(60),
  csPemilik: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
});

export async function updateWaNumber(
  slug: string,
  waNumberId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await requireWorkspace(slug);
  if (!access.canManage) return { error: "Hanya Owner yang bisa mengubah nomor." };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { label, csPemilik } = parsed.data;

  const supabase = await createClient();
  if (csPemilik) {
    const { data: member } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("workspace_id", access.workspace.id)
      .eq("user_id", csPemilik)
      .maybeSingle();
    if (!member) return { error: "CS pemilik bukan anggota workspace ini." };
  }
  // Sesi user punya hak update (label, cs_pemilik); RLS membatasi ke Owner.
  const { data, error } = await supabase
    .from("wa_numbers")
    .update({ label, cs_pemilik: csPemilik })
    .eq("id", waNumberId)
    .eq("workspace_id", access.workspace.id)
    .select("id");
  if (error || !data?.length) return { error: "Gagal menyimpan perubahan." };
  refresh();
  return { success: "Tersimpan." };
}
