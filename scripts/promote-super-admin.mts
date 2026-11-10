// Menjadikan akun yang sudah ada sebagai Super Admin Delegativ.
// Pakai: npm run admin:promote -- email@contoh.com
//
// Akunnya dibuat dulu di dashboard Supabase (Authentication → Users → Add user)
// dengan password pilihan sendiri, supaya password tidak pernah lewat script ini.

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!email) {
  console.error("Pakai: npm run admin:promote -- email@contoh.com");
  process.exit(1);
}
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus ada di .env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const { data, error } = await admin
  .from("profiles")
  .update({ is_super_admin: true })
  .eq("email", email)
  .select("email");

if (error) {
  console.error(`Gagal: ${error.message}`);
  process.exit(1);
}
if (!data?.length) {
  console.error(`Akun ${email} tidak ditemukan. Buat dulu di Supabase → Authentication → Users.`);
  process.exit(1);
}
console.log(`${email} sekarang Super Admin.`);
