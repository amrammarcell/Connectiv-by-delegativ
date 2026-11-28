import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("encryptSecret / decryptSecret (AES-256-GCM)", () => {
  it("round trip mengembalikan teks asli, ciphertext tidak memuat teks asli", () => {
    const token = "EAAG-business-token-contoh-123";
    const enc = encryptSecret(token, key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(token);
    expect(decryptSecret(enc, key)).toBe(token);
  });

  it("IV acak: enkripsi dua kali menghasilkan ciphertext berbeda", () => {
    expect(encryptSecret("sama", key)).not.toBe(encryptSecret("sama", key));
  });

  it("kunci salah atau data diubah → error", () => {
    const enc = encryptSecret("rahasia", key);
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
    const parts = enc.split(":");
    const tampered = [...parts.slice(0, 3), Buffer.from("lain").toString("base64url")].join(":");
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret("bukan-format", key)).toThrow(/Format/);
  });

  it("menolak kunci yang bukan 32 byte", () => {
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow(/32 byte/);
  });
});
