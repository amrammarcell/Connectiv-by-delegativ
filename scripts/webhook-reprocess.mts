// Memproses ulang webhook yang belum diproses (mis. nomor baru saja
// didaftarkan, atau pemrosesan gagal).
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
const result = await processPendingEvents(admin);
console.log(
  `${result.events} event diperiksa · ${result.inserted} pesan baru · ${result.duplicate} duplikat` +
    (result.unknownNumbers.length ? ` · nomor belum terdaftar: ${result.unknownNumbers.join(", ")}` : ""),
);
