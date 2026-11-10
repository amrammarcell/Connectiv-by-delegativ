import { describe, expect, it } from "vitest";
import { safeNextPath, SLUG_PATTERN, slugify } from "@/lib/text";

describe("slugify", () => {
  it.each([
    ["Butik Aisyah", "butik-aisyah"],
    ["  Toko Sinar & Jaya!! ", "toko-sinar-jaya"],
    ["Café Ñoño", "cafe-nono"],
    ["---", ""],
  ])("%s → %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("hasil yang tidak kosong selalu lolos aturan slug di database", () => {
    for (const input of ["A B C", "x".repeat(100), "Rumah Makan 99 - Cabang 2"]) {
      const slug = slugify(input);
      expect(slug).toMatch(SLUG_PATTERN);
      expect(slug.length).toBeLessThanOrEqual(48);
    }
  });
});

describe("safeNextPath", () => {
  it("menerima path internal", () => {
    expect(safeNextPath("/w/demo/inbox?x=1")).toBe("/w/demo/inbox?x=1");
  });

  it.each([null, "", "https://jahat.com", "//jahat.com", "/\\jahat.com", "w/demo"])(
    "menolak %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );
});
