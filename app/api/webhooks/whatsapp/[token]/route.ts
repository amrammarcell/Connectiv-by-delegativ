import { whatsappEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstField, parseEnvelope, safeEqual, verifyHandshake, verifySignature } from "@/lib/whatsapp/webhook";

// Penerima webhook WhatsApp. Tahap ini hanya MENYIMPAN payload mentah ke
// webhook_events dan langsung membalas 200; pemrosesan menjadi kontak dan
// pesan ditambahkan di Sprint 2 (adapter + processor).
//
// Lewat Dualhook, Meta menandatangani payload dengan app secret Dualhook yang
// tidak bisa kita ketahui. Maka keaslian dijaga oleh token rahasia di URL,
// pemeriksaan bentuk payload, dan (nanti) pencocokan phone_number_id terdaftar.

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: Request, ctx: RouteContext<"/api/webhooks/whatsapp/[token]">) {
  const env = whatsappEnv();
  const { token } = await ctx.params;
  if (!safeEqual(token, env.WHATSAPP_WEBHOOK_PATH_TOKEN)) return notFound();

  const challenge = verifyHandshake(new URL(request.url).searchParams, env.WHATSAPP_VERIFY_TOKEN);
  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/whatsapp/[token]">) {
  const env = whatsappEnv();
  const { token } = await ctx.params;
  if (!safeEqual(token, env.WHATSAPP_WEBHOOK_PATH_TOKEN)) return notFound();

  const rawBody = await request.text();
  const envelope = parseEnvelope(rawBody);
  if (!envelope) return new Response("Bad request", { status: 400 });

  const signatureValid = env.WHATSAPP_APP_SECRET
    ? verifySignature(rawBody, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)
    : null;
  if (signatureValid === false) return new Response("Invalid signature", { status: 401 });

  const { error } = await createAdminClient().from("webhook_events").insert({
    sumber: "whatsapp",
    jenis: firstField(envelope),
    payload_mentah: envelope,
    signature_valid: signatureValid,
  });
  // Gagal simpan: balas 500 supaya Meta mengirim ulang (retry beberapa hari).
  if (error) {
    console.error("webhook_events insert failed", error.message);
    return new Response("Storage error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
