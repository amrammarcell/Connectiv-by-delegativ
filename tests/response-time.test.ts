import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/format";
import { formatDuration, responseStatus } from "@/lib/response-time";

const now = new Date("2026-11-18T07:00:00Z").getTime();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const batas = { kuning: 15, merah: 60 };

describe("formatDuration", () => {
  it.each([
    [0.5, "<1 mnt"],
    [12, "12 mnt"],
    [135, "2 jam"],
    [60 * 26, "1 hari"],
  ])("%s menit → %s", (m, expected) => expect(formatDuration(m)).toBe(expected));
});

describe("responseStatus", () => {
  it.each([
    [6, "hijau", "Menunggu 6 mnt"],
    [22, "kuning", "Menunggu 22 mnt"],
    [135, "merah", "Menunggu 2 jam"],
  ])("menunggu %s menit → %s", (m, level, label) => {
    expect(responseStatus({ menunggu_balasan_sejak: ago(m), pesan_terakhir_pada: ago(m) }, now, batas)).toMatchObject({
      waiting: true,
      level,
      label,
    });
  });

  it("sudah dibalas → netral dengan waktu pesan terakhir", () => {
    expect(responseStatus({ menunggu_balasan_sejak: null, pesan_terakhir_pada: ago(18) }, now, batas)).toEqual({
      waiting: false,
      level: "netral",
      label: "Dibalas 18 mnt lalu",
      long: "Dibalas 18 mnt lalu",
    });
  });

  it("mengikuti batas waktu workspace", () => {
    const s = responseStatus({ menunggu_balasan_sejak: ago(10), pesan_terakhir_pada: ago(10) }, now, { kuning: 5, merah: 8 });
    expect(s?.level).toBe("merah");
  });

  it("kontak tanpa pesan tidak punya status", () => {
    expect(responseStatus({ menunggu_balasan_sejak: null, pesan_terakhir_pada: null }, now, batas)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("memformat nomor Indonesia dan nomor lain", () => {
    expect(formatPhone("6281234567890")).toBe("+62 812-3456-7890");
    expect(formatPhone("15551661742")).toBe("+15551661742");
  });
});
