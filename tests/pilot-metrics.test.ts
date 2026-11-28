import { describe, expect, it } from "vitest";
import { accessFromHeaders, PATH_HEADER } from "@/lib/activity-shared";
import { computePilotMetrics, parsePilotRange, pilotDateRange, type PilotRaw } from "@/lib/pilot-metrics";

const base: PilotRaw = {
  mirror: {
    dikirim_meta: 1000,
    tersimpan: 995,
    dikirim_meta_live: 500,
    tersimpan_live: 500,
    event_total: 40,
    event_belum_diproses: 0,
    pesan: { masuk: 300, keluar: 200 },
  },
  closing: { kontak: 50, ditandai: 40, closing: 10, lost: 30 },
  ctwa: {
    percakapan_meta: 20,
    akun_iklan_aktif: 1,
    kontak_ctwa: 17,
    kontak_ctwa_iklan_dikenal: 15,
    pelanggan_referral: 20,
    pelanggan_referral_dengan_id: 19,
  },
  kunjungan: [
    { user_id: "a", nama: "Owner", peran: "owner", kunjungan: 14, terakhir: null },
    { user_id: "b", nama: "Spv", peran: "supervisor", kunjungan: 2, terakhir: null },
  ],
};

const byKey = (raw: PilotRaw, days = 14) => Object.fromEntries(computePilotMetrics(raw, days).map((m) => [m.key, m]));

describe("computePilotMetrics", () => {
  it("menghitung rasio dan status terhadap target", () => {
    const m = byKey(base);
    expect(m.mirror).toMatchObject({ value: 0.995, status: "hijau" });
    expect(m.closing).toMatchObject({ value: 0.8, status: "hijau" });
    expect(m.ctwa).toMatchObject({ value: 0.95, status: "hijau" });
    // 14 kunjungan dalam 14 hari = 7x/minggu.
    expect(m.dashboard).toMatchObject({ value: 7, status: "hijau" });
  });

  it("merah di bawah target", () => {
    const m = byKey({
      ...base,
      mirror: { ...base.mirror, tersimpan: 980 },
      closing: { ...base.closing, ditandai: 30 },
      kunjungan: [{ ...base.kunjungan[1]!, kunjungan: 4 }],
    });
    expect(m.mirror!.status).toBe("merah");
    expect(m.closing!.status).toBe("merah");
    expect(m.dashboard).toMatchObject({ value: 2, status: "merah" });
  });

  it("CTWA memakai referral jika belum ada data Meta Ads, dan dibatasi 100%", () => {
    const noMeta = byKey({ ...base, ctwa: { ...base.ctwa, percakapan_meta: 0, pelanggan_referral: 10, pelanggan_referral_dengan_id: 8 } });
    expect(noMeta.ctwa).toMatchObject({ value: 0.8, status: "merah" });
    expect(noMeta.ctwa!.basis).toContain("belum ada data Meta Ads");
    const over = byKey({ ...base, ctwa: { ...base.ctwa, percakapan_meta: 5 } });
    expect(over.ctwa!.value).toBe(1);
  });

  it("kosong tanpa data, dan angka string dari Postgres tetap dihitung", () => {
    const empty = byKey({
      ...base,
      mirror: { ...base.mirror, dikirim_meta: 0, tersimpan: 0 },
      closing: { kontak: 0, ditandai: 0, closing: 0, lost: 0 },
      ctwa: { ...base.ctwa, percakapan_meta: 0, pelanggan_referral: 0, pelanggan_referral_dengan_id: 0 },
      kunjungan: [],
    });
    for (const k of ["mirror", "closing", "ctwa", "dashboard"]) expect(empty[k]!.status).toBe("kosong");

    const strings = byKey({ ...base, closing: { kontak: "10", ditandai: "7", closing: "3", lost: "4" } as never });
    expect(strings.closing).toMatchObject({ value: 0.7, status: "hijau" });
  });
});

describe("rentang metrik pilot", () => {
  it("default 28 hari, tanggal WIB termasuk hari ini", () => {
    expect(parsePilotRange(undefined)).toBe("28");
    expect(parsePilotRange("7")).toBe("7");
    expect(parsePilotRange("99")).toBe("28");
    // 28 Nov 2026 20:00 UTC = 29 Nov 03:00 WIB.
    expect(pilotDateRange("7", new Date("2026-11-28T20:00:00Z"))).toEqual({ dari: "2026-11-23", sampai: "2026-11-29", days: 7 });
  });
});

describe("accessFromHeaders", () => {
  const h = (values: Record<string, string>) => new Headers(values);
  it("membaca path dari proxy dan membedakan Server Action", () => {
    expect(accessFromHeaders(h({ [PATH_HEADER]: "/w/demo/inbox" }))).toEqual({ path: "/w/demo/inbox", aksi: "lihat" });
    expect(accessFromHeaders(h({ [PATH_HEADER]: "/w/demo/kontak", "next-action": "abc" }))).toEqual({
      path: "/w/demo/kontak",
      aksi: "aksi",
    });
  });

  it("path tidak valid atau kosong menjadi '/'", () => {
    expect(accessFromHeaders(h({}))).toEqual({ path: "/", aksi: "lihat" });
    expect(accessFromHeaders(h({ [PATH_HEADER]: "https://evil" })).path).toBe("/");
  });
});
