// Mengukur waktu query utama per halaman (hanya baca) terhadap project
// Supabase dari .env.local. Setiap halaman diukur sebagai rangkaian tahap:
// query di dalam satu tahap berjalan paralel, antar tahap berurutan, persis
// seperti kode halaman ("before" = sebelum jalur 9, "after" = sesudahnya).
//
// Pakai:
//   npm run perf:pages                       (workspace sobat-import, 5 putaran)
//   npm run perf:pages -- --slug demo --runs 10
//
// Default memakai secret key (RLS dilewati), jadi angka ini = jaringan + query
// tanpa biaya policy. Untuk mengukur dengan RLS, isi PERF_EMAIL dan
// PERF_PASSWORD (akun anggota workspace atau Super Admin) di environment;
// kredensial tidak pernah dicetak.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONTACT_COLUMNS, MESSAGE_COLUMNS } from "../components/inbox/types";
import { DEAL_COLUMNS } from "../lib/deals";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const slug = arg("slug", "sobat-import");
const runs = Number(arg("runs", "5"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !secret || !publishable) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, dan SUPABASE_SECRET_KEY harus ada.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
let db: SupabaseClient = admin;
let mode = "secret key (tanpa RLS)";
if (process.env.PERF_EMAIL && process.env.PERF_PASSWORD) {
  db = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.auth.signInWithPassword({
    email: process.env.PERF_EMAIL,
    password: process.env.PERF_PASSWORD,
  });
  if (error) throw new Error(`Login gagal: ${error.message}`);
  mode = "sesi user (RLS berlaku)";
}

const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).single<{ id: string }>();
if (!ws) throw new Error(`Workspace ${slug} tidak ditemukan`);
const wsId = ws.id;
const { data: busiest } = await admin
  .from("contacts")
  .select("id")
  .eq("workspace_id", wsId)
  .order("pesan_terakhir_pada", { ascending: false, nullsFirst: false })
  .limit(1)
  .single<{ id: string }>();
const contactId = busiest!.id;
const { data: anyUser } = await admin.from("memberships").select("user_id").eq("workspace_id", wsId).limit(1).single();
const userId = anyUser!.user_id as string;

const today = new Date().toISOString().slice(0, 10);
const from30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

type Q = () => PromiseLike<{ error: { message: string } | null }>;
const q = {
  // requireWorkspace (getUser memakai getClaims + profil; di sini hanya profil)
  profile: () => db.from("profiles").select("email, nama, is_super_admin").eq("id", userId).maybeSingle(),
  workspace: () => db.from("workspaces").select("id, nama, slug, batas_kuning_menit, batas_merah_menit").eq("slug", slug).maybeSingle(),
  membership: () => db.from("memberships").select("peran").eq("workspace_id", wsId).eq("user_id", userId).maybeSingle(),
  workspaceWithRole: () =>
    db
      .from("workspaces")
      .select("id, nama, slug, batas_kuning_menit, batas_merah_menit, memberships(peran)")
      .eq("slug", slug)
      .eq("memberships.user_id", userId)
      .maybeSingle(),
  myWorkspaces: () => db.from("memberships").select("peran, workspaces(nama, slug)").eq("user_id", userId),
  stages: () => db.from("stages").select("id, nama, urutan, tipe").eq("workspace_id", wsId).order("urutan"),
  numbers: () => db.from("wa_numbers").select("id, label").eq("workspace_id", wsId),
  allProfiles: () => db.from("profiles").select("id, nama, email"),
  members: () => db.from("memberships").select("peran, profiles(id, nama, email)").eq("workspace_id", wsId),
  inboxList: () =>
    db
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("workspace_id", wsId)
      .not("pesan_terakhir_pada", "is", null)
      .order("pesan_terakhir_pada", { ascending: false })
      .limit(300),
  contact: () => db.from("contacts").select(CONTACT_COLUMNS).eq("id", contactId).eq("workspace_id", wsId).maybeSingle(),
  messages: () =>
    db.from("messages").select(MESSAGE_COLUMNS).eq("contact_id", contactId).order("dikirim_pada", { ascending: false }).limit(500),
  contactsList: () =>
    db
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("workspace_id", wsId)
      .order("pesan_terakhir_pada", { ascending: false, nullsFirst: false })
      .limit(1000),
  notes: () => db.from("contact_notes").select("id, isi, pada, oleh_user").eq("contact_id", contactId).order("pada", { ascending: false }),
  history: () =>
    db
      .from("stage_history")
      .select("id, dari_stage, ke_stage, oleh_user, pada")
      .eq("contact_id", contactId)
      .order("pada", { ascending: false })
      .limit(50),
  deals: () => db.from("deals").select(DEAL_COLUMNS).eq("contact_id", contactId),
  pipelineContacts: () =>
    db
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("workspace_id", wsId)
      .order("pesan_terakhir_pada", { ascending: false, nullsFirst: false })
      .limit(500),
  pipelineDeals: () =>
    db
      .from("deals")
      .select(DEAL_COLUMNS)
      .eq("workspace_id", wsId)
      .order("pada", { ascending: false })
      .limit(1000),
  dashAds: () => db.rpc("dashboard_ads", { ws: wsId, dari: from30, sampai: today }),
  dashFunnel: () => db.rpc("dashboard_funnel", { ws: wsId, dari: from30, sampai: today }),
  dashLost: () => db.rpc("dashboard_lost_reasons", { ws: wsId, dari: from30, sampai: today }),
  dashResponse: () => db.rpc("dashboard_response", { ws: wsId, dari: from30, sampai: today }),
} satisfies Record<string, Q>;

type Stage = (keyof typeof q)[];
// Tahap requireWorkspace yang dipakai semua halaman workspace.
const authBefore: Stage[] = [["profile"], ["workspace"], ["membership"]];
const authAfter: Stage[] = [["profile", "workspaceWithRole"]];

// Lookup yang di-cache sesudah jalur 9 tidak dihitung pada "after" (cache hangat).
const flows: Record<string, { before: Stage[]; after: Stage[] }> = {
  "Inbox (daftar)": {
    before: [...authBefore, ["stages", "numbers", "allProfiles"], ["inboxList"]],
    after: [...authAfter, ["inboxList"]],
  },
  "Percakapan": {
    before: [...authBefore, ["stages", "numbers", "allProfiles", "members"], ["contact"], ["messages"]],
    after: [...authAfter, ["contact", "messages"]],
  },
  "Kontak": {
    before: [...authBefore, ["stages", "numbers", "allProfiles"], ["contactsList"]],
    after: [...authAfter, ["contactsList"]],
  },
  "Detail kontak": {
    before: [...authBefore, ["stages", "numbers", "allProfiles", "members"], ["contact"], ["notes", "history", "deals"]],
    after: [...authAfter, ["contact", "notes", "history", "deals"]],
  },
  "Pipeline": {
    before: [...authBefore, ["stages", "members", "pipelineContacts", "pipelineDeals"]],
    after: [...authAfter, ["pipelineContacts", "pipelineDeals"]],
  },
  "Dashboard (30 hari)": {
    before: [...authBefore, ["dashAds", "dashFunnel", "dashLost", "dashResponse"]],
    after: [...authAfter, ["dashAds", "dashFunnel", "dashLost", "dashResponse"]],
  },
};

async function timeQuery(name: keyof typeof q) {
  const t = performance.now();
  const { error } = await q[name]();
  if (error) throw new Error(`${name}: ${error.message}`);
  return performance.now() - t;
}

async function timeFlow(stages: Stage[]) {
  const t = performance.now();
  for (const stage of stages) await Promise.all(stage.map(timeQuery));
  return performance.now() - t;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const fmt = (ms: number) => `${Math.round(ms)} ms`;

console.log(`Workspace ${slug} · ${runs} putaran · ${mode}\n`);

// Pemanasan: koneksi HTTP dan cache Postgres.
await timeFlow(flows["Inbox (daftar)"].before);

console.log("Query tunggal (median):");
for (const name of Object.keys(q) as (keyof typeof q)[]) {
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) xs.push(await timeQuery(name));
  console.log(`  ${name.padEnd(20)} ${fmt(median(xs)).padStart(8)}   (min ${fmt(Math.min(...xs))}, maks ${fmt(Math.max(...xs))})`);
}

console.log("\nHalaman (median, tahap berurutan seperti kode):");
for (const [page, flow] of Object.entries(flows)) {
  const before: number[] = [];
  const after: number[] = [];
  for (let i = 0; i < runs; i++) {
    before.push(await timeFlow(flow.before));
    after.push(await timeFlow(flow.after));
  }
  console.log(
    `  ${page.padEnd(22)} before ${fmt(median(before)).padStart(8)} (${flow.before.length} tahap)   after ${fmt(median(after)).padStart(8)} (${flow.after.length} tahap)`,
  );
}
