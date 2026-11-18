import { after } from "next/server";
import { whatsappEnv, type WhatsappEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhookEvent } from "@/lib/whatsapp/processor";
import { firstField, parseEnvelope, safeEqual, verifyHandshake, verifySignature } from "@/lib/whatsapp/webhook";

// Penerima webhook WhatsApp: simpan payload mentah ke webhook_events, balas
// 200, lalu proses menjadi kontak dan pesan dengan after().
//
// Lewat Dualhook, Meta menandatangani payload dengan app secret Dualhook yang
// tidak bisa kita ketahui. Maka keaslian dijaga oleh token rahasia di URL,
// pemeriksaan bentuk payload, dan (nanti) pencocokan phone_number_id terdaftar.

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
  const { token } = await ctx.params;
  if (!safeEqual(token, env.WHATSAPP_WEBHOOK_PATH_TOKEN)) return notFound();

  const challenge = verifyHandshake(new URL(request.url).searchParams, env.WHATSAPP_VERIFY_TOKEN);
  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/whatsapp/[token]">) {
  const env = loadEnv();
  if (env instanceof Response) return env;
  const { token } = await ctx.params;
  if (!safeEqual(token, env.WHATSAPP_WEBHOOK_PATH_TOKEN)) return notFound();

  const rawBody = await request.text();
  const envelope = parseEnvelope(rawBody);
  if (!envelope) return new Response("Bad request", { status: 400 });

  const signatureValid = env.WHATSAPP_APP_SECRET
    ? verifySignature(rawBody, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)
    : null;
  // Payload dengan signature salah tetap dicatat (signature_valid = false) untuk
  // debug, tetapi dijawab 401 dan tidak pernah diproses.
  const admin = createAdminClient();
  const { data: event, error } = await admin
    .from("webhook_events")
    .insert({
      sumber: "whatsapp",
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
    try {
      await processWebhookEvent(admin, event.id);
    } catch (err) {
      console.error("webhook processing failed", event.id, err instanceof Error ? err.message : err);
    }
  });

  return new Response("OK", { status: 200 });
}
