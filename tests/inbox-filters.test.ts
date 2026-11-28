import { describe, expect, it } from "vitest";
import {
  adLabel,
  advancedFilterCount,
  compareInbox,
  EMPTY_FILTERS,
  inboxFiltersToQuery,
  inboxRpcArgs,
  isUnread,
  matchesInboxFilters,
  parseInboxFilters,
} from "@/lib/inbox-filters";

const CS = "11111111-1111-4111-8111-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";

const base = {
  id: "c1",
  nama: "Budi Santoso",
  nomor_hp: "6281234567890",
  assigned_to: CS,
  stage_id: STAGE,
  sumber: "ctwa",
  ad_id: "120001",
  pesan_terakhir_pada: "2026-11-20T18:30:00.000Z", // 21 Nov 01:30 WIB
  arah_pesan_terakhir: "masuk" as const,
  menunggu_balasan_sejak: "2026-11-20T18:30:00.000Z",
  wa_number_id_terakhir: null,
};

describe("parseInboxFilters", () => {
  it("membaca URLSearchParams dan objek searchParams Next", () => {
    const fromUrl = parseInboxFilters(new URLSearchParams(`tab=belum&cs=${CS}&dari=2026-11-01&q=budi`));
    expect(fromUrl).toMatchObject({ tab: "belum", cs: CS, dari: "2026-11-01", q: "budi" });
    const fromObject = parseInboxFilters({ stage: [STAGE], iklan: "120001" });
    expect(fromObject).toMatchObject({ stage: STAGE, iklan: "120001", tab: "semua" });
  });

  it("membuang nilai yang tidak valid", () => {
    const f = parseInboxFilters(new URLSearchParams("tab=x&cs=bukan-uuid&stage=1&dari=kemarin&iklan=a b"));
    expect(f).toEqual(EMPTY_FILTERS);
    expect(parseInboxFilters(new URLSearchParams("cs=tanpa")).cs).toBe("tanpa");
  });
});

describe("inboxFiltersToQuery", () => {
  it("hanya menulis nilai yang aktif", () => {
    expect(inboxFiltersToQuery(EMPTY_FILTERS)).toBe("");
    expect(inboxFiltersToQuery({ ...EMPTY_FILTERS, tab: "iklan", stage: STAGE })).toBe(`?tab=iklan&stage=${STAGE}`);
    expect(advancedFilterCount({ ...EMPTY_FILTERS, dari: "2026-11-01", sampai: "2026-11-02", cs: CS })).toBe(2);
  });
});

describe("inboxRpcArgs", () => {
  it("memetakan tab dan filter ke parameter SQL", () => {
    const args = inboxRpcArgs("ws", { ...EMPTY_FILTERS, tab: "belum", cs: "tanpa" }, { waktu: "t", id: "i" }, 50);
    expect(args).toMatchObject({ p_urutan: "menunggu", p_menunggu: true, p_cs: null, p_tanpa_cs: true, p_kursor_id: "i" });
    expect(inboxRpcArgs("ws", { ...EMPTY_FILTERS, tab: "baru" }, null, 50)).toMatchObject({ p_belum_dibaca: true, p_urutan: "terbaru" });
  });
});

describe("isUnread", () => {
  it("hanya pesan masuk yang belum dibuka sejak pesan terakhir", () => {
    expect(isUnread(base, null)).toBe(true);
    expect(isUnread(base, "2026-11-20T18:00:00Z")).toBe(true);
    expect(isUnread(base, "2026-11-20T19:00:00Z")).toBe(false);
    expect(isUnread({ ...base, arah_pesan_terakhir: "keluar" }, null)).toBe(false);
  });
});

describe("matchesInboxFilters", () => {
  it("cocok dengan filter CS, stage, iklan, dan pencarian", () => {
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, cs: CS, stage: STAGE, iklan: "120001", q: "budi" }, null)).toBe(true);
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, cs: "tanpa" }, null)).toBe(false);
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, q: "0812345" }, null)).toBe(true);
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, q: "0899" }, null)).toBe(false);
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, q: "8123456" }, null)).toBe(true);
  });

  it("rentang tanggal memakai tanggal Asia/Jakarta", () => {
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, dari: "2026-11-21" }, null)).toBe(true);
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, sampai: "2026-11-20" }, null)).toBe(false);
  });

  it("tab belum dibaca memakai status baca", () => {
    expect(matchesInboxFilters(base, { ...EMPTY_FILTERS, tab: "baru" }, "2026-11-21T00:00:00Z")).toBe(false);
  });
});

describe("compareInbox", () => {
  it("terbaru dulu, atau paling lama menunggu dulu", () => {
    const older = { ...base, id: "c2", pesan_terakhir_pada: "2026-11-19T00:00:00Z", menunggu_balasan_sejak: "2026-11-19T00:00:00Z" };
    expect([older, base].sort(compareInbox("semua")).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect([base, older].sort(compareInbox("belum")).map((c) => c.id)).toEqual(["c2", "c1"]);
  });
});

describe("adLabel", () => {
  it("nama Meta, lalu headline, lalu id", () => {
    expect(adLabel("1", "Headline", { "1": "Nama Meta" })).toBe("Nama Meta");
    expect(adLabel("1", "Headline", {})).toBe("Headline");
    expect(adLabel("1", null, {})).toBe("Iklan 1");
  });
});
