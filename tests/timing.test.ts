import { describe, expect, it } from "vitest";
import { timed } from "@/lib/timing";

function clock(...ticks: number[]) {
  return () => ticks.shift() ?? 0;
}

describe("timed", () => {
  it("mengembalikan hasil dan durasi yang dibulatkan", async () => {
    const out = await timed(async () => "ok", clock(10, 52.6));
    expect(out).toEqual({ ms: 43, result: "ok" });
  });

  it("menangkap error tanpa melempar dan tetap mencatat durasi", async () => {
    const boom = new Error("gagal");
    const out = await timed(async () => {
      throw boom;
    }, clock(0, 7));
    expect(out.ms).toBe(7);
    expect(out.error).toBe(boom);
    expect(out.result).toBeUndefined();
  });
});
