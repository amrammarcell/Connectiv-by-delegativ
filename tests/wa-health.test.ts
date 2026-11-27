import { describe, expect, it } from "vitest";
import { numberWarnings, type NumberHealthInput } from "@/lib/wa-health";

const now = Date.UTC(2026, 10, 27, 12, 0);
const ago = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

const base: NumberHealthInput = {
  status: "aktif",
  status_alasan: null,
  terakhir_terima_pesan: ago(1),
  terakhir_balasan_cs: ago(2),
  tersambung_pada: ago(24 * 30),
};

describe("numberWarnings", () => {
  it("nomor sehat tanpa peringatan", () => {
    expect(numberWarnings(base, now)).toEqual([]);
  });

  it("terputus menampilkan alasan dari account_update", () => {
    expect(numberWarnings({ ...base, status: "terputus", status_alasan: "PARTNER_REMOVED" }, now)).toEqual([
      { level: "merah", text: "Terputus (PARTNER_REMOVED)" },
    ]);
  });

  it("tidak ada pesan lebih dari 24 jam", () => {
    expect(numberWarnings({ ...base, terakhir_terima_pesan: ago(30) }, now)).toEqual([
      { level: "kuning", text: "Tidak ada pesan 30 jam" },
    ]);
    expect(numberWarnings({ ...base, terakhir_terima_pesan: ago(23) }, now)).toEqual([]);
  });

  it("peringatan 14 hari: kuning sejak 12 hari, merah sejak 14 hari tanpa balasan CS dari aplikasi", () => {
    expect(numberWarnings({ ...base, terakhir_balasan_cs: ago(24 * 11) }, now)).toEqual([]);
    const [kuning] = numberWarnings({ ...base, terakhir_balasan_cs: ago(24 * 12) }, now);
    expect(kuning).toMatchObject({ level: "kuning" });
    expect(kuning!.text).toContain("12 hari");
    expect(numberWarnings({ ...base, terakhir_balasan_cs: ago(24 * 15) }, now)[0]).toMatchObject({ level: "merah" });
  });

  it("belum pernah ada balasan CS: dihitung sejak nomor tersambung", () => {
    expect(numberWarnings({ ...base, terakhir_balasan_cs: null, tersambung_pada: ago(24 * 3) }, now)).toEqual([]);
    expect(numberWarnings({ ...base, terakhir_balasan_cs: null }, now)[0]).toMatchObject({ level: "merah" });
  });
});
