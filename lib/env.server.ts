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
  // URL terpisah untuk nomor yang tersambung lewat Dualhook (signature memakai
  // secret Dualhook, jadi tidak diverifikasi). Kosong = jalur Dualhook mati.
  WHATSAPP_DUALHOOK_PATH_TOKEN: z.string().min(24).optional(),
  WHATSAPP_DUALHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
});

export type WhatsappEnv = z.infer<typeof whatsappSchema>;

export function whatsappEnv(): WhatsappEnv {
  return parseEnv(whatsappSchema, {
    WHATSAPP_WEBHOOK_PATH_TOKEN: process.env.WHATSAPP_WEBHOOK_PATH_TOKEN,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || undefined,
    WHATSAPP_DUALHOOK_PATH_TOKEN: process.env.WHATSAPP_DUALHOOK_PATH_TOKEN || undefined,
    WHATSAPP_DUALHOOK_VERIFY_TOKEN: process.env.WHATSAPP_DUALHOOK_VERIFY_TOKEN || undefined,
  });
}

const metaAdsSchema = z.object({
  // Token system user Business Manager Delegativ dengan izin ads_read ke ad
  // account klien. Kosong = sinkronisasi iklan belum aktif.
  META_ADS_ACCESS_TOKEN: z.string().min(1).optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v27.0"),
  // Dipakai Vercel Cron sebagai "Authorization: Bearer <CRON_SECRET>".
  CRON_SECRET: z.string().min(16).optional(),
});

export type MetaAdsEnv = z.infer<typeof metaAdsSchema>;

export function metaAdsEnv(): MetaAdsEnv {
  return parseEnv(metaAdsSchema, {
    META_ADS_ACCESS_TOKEN: process.env.META_ADS_ACCESS_TOKEN || undefined,
    META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
  });
}

// Jalur resmi Tech Provider (Embedded Signup + Coexistence). Fitur hanya aktif
// jika semua variabel wajib terisi; selama verifikasi bisnis/App Review Meta
// belum selesai, biarkan kosong dan tombol "Tambah nomor WhatsApp" tidak tampil.
const techProviderSchema = z.object({
  // App ID app Meta "Connectiv" (App settings → Basic). Bukan rahasia, dikirim
  // ke browser untuk FB.init.
  META_APP_ID: z.string().regex(/^\d{5,30}$/),
  // Facebook Login for Business → Configurations → Configuration ID.
  META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().regex(/^\d{5,30}$/),
  // App secret yang sama dengan verifikasi signature webhook; hanya di server.
  WHATSAPP_APP_SECRET: z.string().min(16),
  // 32 byte acak dalam base64 (npm run webhook:tokens) untuk AES-256-GCM token bisnis.
  WHATSAPP_TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "harus 32 byte base64"),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v27.0"),
});

export type TechProviderEnv = z.infer<typeof techProviderSchema>;

// null = fitur mati (env belum lengkap atau tidak valid).
export function techProviderEnv(): TechProviderEnv | null {
  const result = techProviderSchema.safeParse({
    META_APP_ID: process.env.META_APP_ID || undefined,
    META_EMBEDDED_SIGNUP_CONFIG_ID: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || undefined,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || undefined,
    WHATSAPP_TOKEN_ENCRYPTION_KEY: process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || undefined,
    META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || undefined,
  });
  return result.success ? result.data : null;
}
