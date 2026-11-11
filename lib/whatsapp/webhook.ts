import { createHmac, timingSafeEqual } from "node:crypto";

// Fungsi murni untuk endpoint webhook WhatsApp, terpisah dari route supaya
// mudah dites.

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Handshake pendaftaran webhook Meta: GET ?hub.mode=subscribe&hub.verify_token=..&hub.challenge=..
export function verifyHandshake(params: URLSearchParams, verifyToken: string): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) return null;
  return safeEqual(token, verifyToken) ? challenge : null;
}

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, body mentah).
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return safeEqual(header, expected);
}

export type WebhookEnvelope = {
  object: "whatsapp_business_account";
  entry: { id: string; changes: { field: string; value: unknown }[] }[];
};

export function parseEnvelope(rawBody: string): WebhookEnvelope | null {
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const envelope = data as Partial<WebhookEnvelope>;
  if (envelope.object !== "whatsapp_business_account" || !Array.isArray(envelope.entry)) return null;
  const valid = envelope.entry.every(
    (e) => typeof e?.id === "string" && Array.isArray(e.changes) && e.changes.every((c) => typeof c?.field === "string"),
  );
  return valid ? (envelope as WebhookEnvelope) : null;
}

export function firstField(envelope: WebhookEnvelope): string | null {
  return envelope.entry[0]?.changes[0]?.field ?? null;
}
