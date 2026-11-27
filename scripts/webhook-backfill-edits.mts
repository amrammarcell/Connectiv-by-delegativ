// Menerapkan edit dan revoke dari webhook yang SUDAH diproses sebelum fitur
// edit/revoke ada (dulu diabaikan), atau yang pesan aslinya baru masuk
// belakangan (riwayat chat tidak berurutan). Idempoten.
//
// Pakai:
//   npm run webhook:backfill-edits            # hanya menghitung (dry run)
//   npm run webhook:backfill-edits -- --apply # benar-benar menerapkan

import { createClient } from "@supabase/supabase-js";
import { normalize, type NormalizedUpdate } from "../lib/whatsapp/adapter";
import { emptyBatchResult, addBatchResult, ingestAll } from "../lib/whatsapp/processor";
import { parseEnvelope } from "../lib/whatsapp/webhook";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus ada di .env.local");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const admin = createClient(url, secret, { auth: { persistSession: false } });

const updates: NormalizedUpdate[] = [];
let events = 0;
for (let from = 0; ; from += 100) {
  const { data, error } = await admin
    .from("webhook_events")
    .select("id, payload_mentah")
    .eq("diproses", true)
    .in("jenis", ["messages", "smb_message_echoes", "history"])
    .order("diterima_pada")
    .order("id")
    .range(from, from + 99);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  for (const e of data) {
    events++;
    const envelope = parseEnvelope(JSON.stringify(e.payload_mentah));
    if (envelope) updates.push(...normalize(envelope).updates);
  }
}

const edits = updates.filter((u) => u.kind === "edit").length;
console.log(`${events} webhook diperiksa · ${edits} edit · ${updates.length - edits} revoke ditemukan`);
if (!apply) {
  console.log("Dry run. Jalankan dengan --apply untuk menerapkan.");
  process.exit(0);
}

const total = emptyBatchResult();
for (let i = 0; i < updates.length; i += 1000) {
  addBatchResult(total, await ingestAll(admin, [], updates.slice(i, i + 1000)));
}
console.log(
  `${total.edited} pesan diedit · ${total.revoked} ditandai dihapus · ${total.missing} tanpa pesan asli` +
    (total.unknownNumbers.length ? ` · nomor belum terdaftar: ${total.unknownNumbers.join(", ")}` : ""),
);
