import "server-only";
import { z } from "zod";
import { parseEnv } from "./env";

// Rahasia server. Jangan pernah diimpor dari Client Component.
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseEnv(serverSchema, {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return cached;
}

// Dipisah supaya aplikasi tetap jalan walau webhook belum dikonfigurasi.
const whatsappSchema = z.object({
  // Bagian rahasia di URL webhook: /api/webhooks/whatsapp/<token>.
  WHATSAPP_WEBHOOK_PATH_TOKEN: z.string().min(24),
  // Dicocokkan saat Meta memanggil GET untuk verifikasi pendaftaran.
  WHATSAPP_VERIFY_TOKEN: z.string().min(16),
  // Opsional: hanya ada jika webhook ditandatangani app Meta milik kita sendiri
  // (Tech Provider). Lewat Dualhook, signature memakai secret mereka.
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
});

export type WhatsappEnv = z.infer<typeof whatsappSchema>;

export function whatsappEnv(): WhatsappEnv {
  return parseEnv(whatsappSchema, {
    WHATSAPP_WEBHOOK_PATH_TOKEN: process.env.WHATSAPP_WEBHOOK_PATH_TOKEN,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || undefined,
  });
}
