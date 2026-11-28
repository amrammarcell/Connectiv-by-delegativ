// Membuat token acak untuk webhook WhatsApp dan menambahkannya ke .env.local
// jika belum ada. Nilainya tidak dicetak ke layar.
// Pakai: npm run webhook:tokens

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const FILE = ".env.local";
const current = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const has = (key: string) => new RegExp(`^${key}=.+`, "m").test(current);

const lines: string[] = [];
for (const key of [
  "WHATSAPP_WEBHOOK_PATH_TOKEN",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_DUALHOOK_PATH_TOKEN",
  "WHATSAPP_DUALHOOK_VERIFY_TOKEN",
  "CRON_SECRET",
]) {
  if (has(key)) {
    console.log(`${key} sudah ada, tidak diubah.`);
  } else {
    lines.push(`${key}=${randomBytes(24).toString("base64url")}`);
    console.log(`${key} dibuat.`);
  }
}

// Kunci AES-256-GCM token bisnis jalur resmi: 32 byte base64.
if (has("WHATSAPP_TOKEN_ENCRYPTION_KEY")) {
  console.log("WHATSAPP_TOKEN_ENCRYPTION_KEY sudah ada, tidak diubah.");
} else {
  lines.push(`WHATSAPP_TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
  console.log("WHATSAPP_TOKEN_ENCRYPTION_KEY dibuat.");
}

if (lines.length) {
  appendFileSync(FILE, `${current.endsWith("\n") || !current ? "" : "\n"}\n# Webhook WhatsApp\n${lines.join("\n")}\n`);
}
console.log(`Salin nilainya dari ${FILE} ke Vercel (Environment Variables).`);
