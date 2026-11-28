import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Enkripsi simetris AES-256-GCM untuk rahasia yang disimpan di database
// (token bisnis WhatsApp). Format: "v1:<iv>:<tag>:<ciphertext>" (base64url).
// Tag GCM menjamin isi tidak diubah; kunci salah atau data rusak → error.

const VERSION = "v1";
const IV_BYTES = 12;

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Kunci enkripsi harus 32 byte (base64).");
  return key;
}

export function encryptSecret(plaintext: string, base64Key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(":");
}

export function decryptSecret(payload: string, base64Key: string): string {
  const [version, iv, tag, ciphertext, ...rest] = payload.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length) {
    throw new Error("Format data terenkripsi tidak dikenal.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
