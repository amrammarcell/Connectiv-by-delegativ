import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Membuat akun memerlukan Supabase Admin API (secret key). Pemanggil WAJIB
// sudah memastikan user yang sedang login berhak (Owner workspace atau Super
// Admin) sebelum memanggil fungsi ini. Keanggotaan tetap ditulis lewat client
// sesi user supaya RLS ikut memeriksa.
//
// Selama pilot, akun baru diberi password sementara yang ditampilkan sekali ke
// pembuatnya, karena SMTP bawaan Supabase tidak mengirim email ke luar tim.

export type EnsuredUser = { userId: string; tempPassword: string | null };

export async function ensureUser(email: string, nama: string | null): Promise<EnsuredUser> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();

  const { data: existing, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", normalized)
    .maybeSingle<{ id: string }>();
  if (lookupError) throw new Error(`Gagal mencari user: ${lookupError.message}`);
  if (existing) return { userId: existing.id, tempPassword: null };

  const tempPassword = randomBytes(9).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    password: tempPassword,
    email_confirm: true,
    user_metadata: nama ? { nama } : {},
  });
  if (error || !data.user) throw new Error(`Gagal membuat akun: ${error?.message ?? "tanpa detail"}`);

  return { userId: data.user.id, tempPassword };
}
