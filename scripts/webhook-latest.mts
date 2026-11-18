// Menampilkan ringkasan webhook terakhir yang tersimpan di webhook_events.
// Pakai: npm run webhook:latest            (10 terakhir)
//        npm run webhook:latest -- 3 --raw (3 terakhir, payload lengkap)

import { createClient } from "@supabase/supabase-js";

const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 10);
const raw = process.argv.includes("--raw");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus ada di .env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const { data, error } = await admin
  .from("webhook_events")
  .select("id, jenis, signature_valid, diterima_pada, payload_mentah")
  .order("diterima_pada", { ascending: false })
  .limit(limit);
if (error) throw error;
if (!data.length) console.log("Belum ada webhook yang masuk.");

type Item = { from?: string; to?: string; type?: string; text?: { body?: string }; status?: string; recipient_id?: string };

for (const e of data) {
  const time = new Date(e.diterima_pada).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const sig = e.signature_valid === null ? "tanpa signature" : e.signature_valid ? "signature OK" : "signature SALAH";
  console.log(`\n[${time}] ${e.jenis} · ${sig}`);
  for (const entry of e.payload_mentah.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const items: Item[] = [...(v.messages ?? []), ...(v.message_echoes ?? []), ...(v.statuses ?? [])];
      for (const m of items) {
        if (m.status) console.log(`  status ${m.status} → ${m.recipient_id}`);
        else console.log(`  ${m.from} → ${m.to ?? v.metadata?.display_phone_number} · ${m.type}${m.text?.body ? `: ${m.text.body}` : ""}`);
      }
    }
  }
  if (raw) console.log(JSON.stringify(e.payload_mentah, null, 2));
}
