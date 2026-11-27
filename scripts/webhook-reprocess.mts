// Memproses ulang webhook yang belum diproses (mis. nomor baru saja
// didaftarkan, atau pemrosesan gagal), dari yang terlama sampai habis.
// Pakai: npm run webhook:reprocess

import { createClient } from "@supabase/supabase-js";
import { processPendingEvents } from "../lib/whatsapp/processor";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY harus ada di .env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const started = Date.now();
const r = await processPendingEvents(admin, { limit: 100_000 });
console.log(
  `${r.events} event diperiksa (${r.processed} selesai, ${r.failed} gagal) dalam ${((Date.now() - started) / 1000).toFixed(1)} dtk · ` +
    `${r.inserted} pesan baru · ${r.duplicate} duplikat · ${r.edited} diedit · ${r.revoked} ditarik` +
    (r.missing ? ` · ${r.missing} edit/tarik tanpa pesan asli` : "") +
    (r.unknownNumbers.length ? ` · nomor belum terdaftar: ${r.unknownNumbers.join(", ")}` : ""),
);
