// Mencari workspace dan user sisa test integrasi di project Supabase (dipakai
// juga oleh produksi) lalu menghapusnya. Default dry run: hanya menampilkan.
// Pakai: npm run cleanup:test-workspaces             (dry run)
//        npm run cleanup:test-workspaces -- --apply  (hapus)
//
// Workspace dianggap data uji hanya jika slug-nya cocok dengan pola test
// (`<prefix>-<label>-<run 8 hex>`) DAN namanya diakhiri run id yang sama, mis.
// slug "ops-a-e9d805d1" + nama "ops a e9d805d1". User uji: email
// `<prefix>-<run>-<label>@connectiv.test` (akun QA `qa-*` tidak cocok).

import { createClient } from "@supabase/supabase-js";

// Prefix dari createTestContext(...) dan tests/rls/workspace-isolation.test.ts.
const PREFIXES = ["retensi", "reads", "dash", "deals", "rls-media", "ops", "pipeline", "policy", "batch", "ingest", "rls"];

const prefixPattern = PREFIXES.map((p) => p.replace(/[-]/g, "\\-")).join("|");
const SLUG_RE = new RegExp(`^(?:${prefixPattern})-[a-z0-9-]+-([0-9a-f]{8})$`);
const EMAIL_RE = new RegExp(`^(?:${prefixPattern})-[0-9a-f]{8}-[a-z0-9-]+@connectiv\\.test$`);

function isTestWorkspace(slug: string, nama: string): boolean {
  const m = SLUG_RE.exec(slug);
  return Boolean(m && nama.trim().endsWith(` ${m[1]}`));
}

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus ada di .env.local");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: workspaces, error } = await admin
  .from("workspaces")
  .select("id, nama, slug, dibuat_pada")
  .order("dibuat_pada");
if (error) throw error;
const targets = (workspaces ?? []).filter((w) => isTestWorkspace(w.slug, w.nama));

const users: { id: string; email: string; created_at: string }[] = [];
for (let page = 1; ; page++) {
  const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (listError) throw listError;
  for (const u of data.users) if (u.email && EMAIL_RE.test(u.email)) users.push({ id: u.id, email: u.email, created_at: u.created_at });
  if (data.users.length < 1000) break;
}

const fmt = (v: string) => new Date(v).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

console.log(`Workspace uji: ${targets.length}`);
for (const w of targets) {
  const [{ count: members }, { count: contacts }] = await Promise.all([
    admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("workspace_id", w.id),
    admin.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", w.id),
  ]);
  console.log(`  ${w.slug}  "${w.nama}"  dibuat ${fmt(w.dibuat_pada)}  anggota ${members ?? "?"}, kontak ${contacts ?? "?"}`);
}
console.log(`User uji: ${users.length}`);
for (const u of users) console.log(`  ${u.email}  dibuat ${fmt(u.created_at)}`);

if (!apply) {
  console.log("\nDry run. Jalankan dengan --apply untuk menghapus.");
  process.exit(0);
}

let failed = 0;
if (targets.length) {
  // Data workspace lain (kontak, pesan, deal, nomor, kunjungan) ikut terhapus lewat on delete cascade.
  const { error: delError } = await admin.from("workspaces").delete().in("id", targets.map((w) => w.id));
  if (delError) {
    failed++;
    console.error(`Gagal menghapus workspace: ${delError.message}`);
  }
}
for (const u of users) {
  const { error: userError } = await admin.auth.admin.deleteUser(u.id);
  if (userError) {
    failed++;
    console.error(`Gagal menghapus ${u.email}: ${userError.message}`);
  }
}
const { data: left } = await admin.from("workspaces").select("slug, nama");
const remaining = (left ?? []).filter((w) => isTestWorkspace(w.slug, w.nama));
console.log(`\nSelesai. Workspace uji tersisa: ${remaining.length}. Kegagalan: ${failed}.`);
process.exit(failed || remaining.length ? 1 : 0);
