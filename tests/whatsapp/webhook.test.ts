import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { firstField, parseEnvelope, verifyHandshake, verifySignature } from "@/lib/whatsapp/webhook";

const VERIFY = "verify-token-1234567890";

describe("verifyHandshake", () => {
  const params = (q: Record<string, string>) => new URLSearchParams(q);

  it("mengembalikan challenge jika token cocok", () => {
    expect(
      verifyHandshake(
        params({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "1903260781" }),
        VERIFY,
      ),
    ).toBe("1903260781");
  });

  it.each<Record<string, string>>([
    { "hub.mode": "subscribe", "hub.verify_token": "salah", "hub.challenge": "1" },
    { "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" },
    { "hub.mode": "subscribe", "hub.verify_token": VERIFY },
  ])("menolak %o", (q) => {
    expect(verifyHandshake(params(q), VERIFY)).toBeNull();
  });
});

describe("verifySignature", () => {
  const secret = "app-secret";
  const body = '{"object":"whatsapp_business_account","entry":[]}';
  const sign = (b: string) => `sha256=${createHmac("sha256", secret).update(b).digest("hex")}`;

  it("menerima signature yang benar", () => {
    expect(verifySignature(body, sign(body), secret)).toBe(true);
  });

  it("menolak body yang diubah, header kosong, atau format salah", () => {
    expect(verifySignature(`${body} `, sign(body), secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "md5=abc", secret)).toBe(false);
  });
});

describe("parseEnvelope", () => {
  const inbound = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "102290129340398",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550001234", phone_number_id: "123456789012345" },
              messages: [{ from: "12015550123", id: "wamid.X", timestamp: "1735939200", type: "text", text: { body: "Halo" } }],
            },
          },
        ],
      },
    ],
  };

  it("menerima envelope Meta dan membaca field pertama", () => {
    const envelope = parseEnvelope(JSON.stringify(inbound));
    expect(envelope).not.toBeNull();
    expect(firstField(envelope!)).toBe("messages");
  });

  it.each([
    "bukan json",
    "null",
    JSON.stringify({ object: "page", entry: [] }),
    JSON.stringify({ object: "whatsapp_business_account" }),
    JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: 1, changes: [] }] }),
    JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ value: {} }] }] }),
  ])("menolak payload tidak valid: %s", (raw) => {
    expect(parseEnvelope(raw)).toBeNull();
  });
});
