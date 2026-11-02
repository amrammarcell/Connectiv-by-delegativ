import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "@/lib/env";

const schema = z.object({ URL: z.url(), KEY: z.string().min(1) });

describe("parseEnv", () => {
  it("mengembalikan nilai yang valid", () => {
    expect(parseEnv(schema, { URL: "https://x.supabase.co", KEY: "k" })).toEqual({
      URL: "https://x.supabase.co",
      KEY: "k",
    });
  });

  it("menyebut nama variabel yang hilang tanpa membocorkan nilainya", () => {
    expect(() => parseEnv(schema, { URL: "bukan-url", KEY: "rahasia" })).toThrow(
      /URL/,
    );
    expect(() => parseEnv(schema, { URL: "bukan-url", KEY: "rahasia" })).not.toThrow(
      /rahasia/,
    );
  });
});
