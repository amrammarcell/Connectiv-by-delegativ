import { after } from "next/server";
import { checkWebhookHealth } from "@/lib/alerts";
import { defaultNotifier } from "@/lib/alerts-notifier";
import { whatsappEnv, type WhatsappEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhookEvent } from "@/lib/whatsapp/processor";
import { firstField, parseEnvelope, resolveWebhookSource, verifyHandshake, verifySignature } from "@/lib/whatsapp/webhook";

// Penerima webhook WhatsApp: simpan payload mentah ke webhook_events, balas
// 200, lalu proses menjadi kontak dan pesan dengan after().
//
// Dua URL dengan token rahasia berbeda:
// - app Meta milik Delegativ: signature X-Hub-Signature-256 diverifikasi;
// - Dualhook: Meta menandatangani dengan app secret Dualhook yang tidak bisa
//   kita ketahui, jadi keaslian dijaga token URL, bentuk payload, dan nomor
//   yang harus terdaftar di wa_numbers sebelum pesan diproses.

// after() berjalan dalam batas waktu fungsi ini. Riwayat chat bisa ratusan
// pesan per webhook (diproses per 200 pesan lewat ingest_messages); 300 detik
// adalah batas maksimum Vercel Hobby dengan Fluid Compute.
export const maxDuration = 300;

function notFound() {
  return new Response("Not found", { status: 404 });
}

// Env yang belum lengkap dilaporkan sebagai 503 dengan nama variabelnya
// (tanpa nilai), supaya mudah dibetulkan di Vercel.
function loadEnv(): WhatsappEnv | Response {
  try {
    return whatsappEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Konfigurasi webhook tidak valid.";
    console.error("whatsapp webhook env", message);
    return new Response(message, { status: 503 });
  }
}

export async function GET(request: Request, ctx: RouteContext<"/api/webhooks/whatsapp/[token]">) {
  const env = loadEnv();
  if (env instanceof Response) return env;
  const source = resolveWebhookSource((await ctx.params).token, env);
  if (!source) return notFound();

  const challenge = verifyHandshake(new URL(request.url).searchParams, source.verifyToken);
  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/whatsapp/[token]">) {
  const env = loadEnv();
  if (env instanceof Response) return env;
  const source = resolveWebhookSource((await ctx.params).token, env);
  if (!source) return notFound();

  // Tombol "Test Ping" di dashboard Dualhook: cukup dijawab OK.
  if (source.sumber === "dualhook" && request.headers.get("x-dualhook-event") === "test_ping") {
    return new Response("OK", { status: 200 });
  }

  const rawBody = await request.text();
  const envelope = parseEnvelope(rawBody);
  if (!envelope) return new Response("Bad request", { status: 400 });

  const signatureValid = source.appSecret
    ? verifySignature(rawBody, request.headers.get("x-hub-signature-256"), source.appSecret)
    : null;
  // Payload dengan signature salah tetap dicatat (signature_valid = false) untuk
  // debug, tetapi dijawab 401 dan tidak pernah diproses.
  const admin = createAdminClient();
  const { data: event, error } = await admin
    .from("webhook_events")
    .insert({
      sumber: source.sumber,
      jenis: firstField(envelope),
      payload_mentah: envelope,
      signature_valid: signatureValid,
      diproses: signatureValid === false,
      error: signatureValid === false ? "signature tidak valid" : null,
    })
    .select("id")
    .single();
  if (signatureValid === false) return new Response("Invalid signature", { status: 401 });
  // Gagal simpan: balas 500 supaya Meta mengirim ulang (retry beberapa hari).
  if (error || !event) {
    console.error("webhook_events insert failed", error?.message);
    return new Response("Storage error", { status: 500 });
  }

  // Proses menjadi kontak + pesan setelah membalas, supaya Meta tidak menunggu.
  // Kegagalan tercatat di webhook_events dan bisa diulang (npm run webhook:reprocess).
  after(async () => {
    let healthCheck = false;
    try {
      const result = await processWebhookEvent(admin, event.id);
      healthCheck = result.unknownNumbers.length > 0;
    } catch (err) {
      console.error("webhook processing failed", event.id, err instanceof Error ? err.message : err);
      healthCheck = true;
    }
    // Event gagal/tertunda: buka alert (sekali per kejadian, lib/alerts.ts).
    if (healthCheck) await checkWebhookHealth(admin, defaultNotifier()).catch(() => {});
  });

  return new Response("OK", { status: 200 });
}
