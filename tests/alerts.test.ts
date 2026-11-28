import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  cronIsStale,
  emailNotifier,
  evaluateAdSync,
  evaluateWebhookHealth,
  raiseAlert,
  type WebhookStatRow,
} from "@/lib/alerts";

const now = new Date("2026-11-28T10:00:00Z");
const row = (over: Partial<WebhookStatRow>): WebhookStatRow => ({
  sumber: "dualhook",
  tertunda: 0,
  gagal: 0,
  tertunda_terlama: null,
  error_terakhir: null,
  ...over,
});

describe("evaluateWebhookHealth", () => {
  it("sehat tanpa event gagal dan tanpa tertunda lama", () => {
    expect(evaluateWebhookHealth([row({})], now)).toEqual({ ok: true });
    expect(
      evaluateWebhookHealth([row({ tertunda: 3, tertunda_terlama: "2026-11-28T09:50:00Z" })], now),
    ).toEqual({ ok: true });
  });

  it("gagal jika ada event gagal (angka dari Postgres bisa string)", () => {
    const r = evaluateWebhookHealth([row({ gagal: "2", error_terakhir: "fetch failed" })], now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("2 event gagal (error terakhir: fetch failed)");
  });

  it("gagal jika tertunda lebih dari 30 menit", () => {
    const r = evaluateWebhookHealth([row({ tertunda: 1, tertunda_terlama: "2026-11-28T09:00:00Z" })], now);
    expect(r).toEqual({ ok: false, detail: "dualhook: 1 event tertunda sejak 60 menit lalu" });
  });
});

describe("evaluateAdSync", () => {
  it("melaporkan akun yang gagal", () => {
    expect(evaluateAdSync([{ account: "act_1", rows: 3 }])).toEqual({ ok: true });
    expect(evaluateAdSync([{ account: "act_1", rows: 3 }, { account: "act_2", error: "token kedaluwarsa" }])).toEqual({
      ok: false,
      detail: "act_2: token kedaluwarsa",
    });
  });
});

describe("cronIsStale", () => {
  it("macet jika belum pernah sukses atau lebih dari 26 jam", () => {
    expect(cronIsStale(null, now)).toBe(true);
    expect(cronIsStale("2026-11-27T19:00:00Z", now)).toBe(false);
    expect(cronIsStale("2026-11-27T07:00:00Z", now)).toBe(true);
  });
});

describe("emailNotifier", () => {
  it("null jika kunci atau penerima kosong", () => {
    expect(emailNotifier({ from: "a@b" })).toBeNull();
    expect(emailNotifier({ apiKey: "k", to: " , ", from: "a@b" })).toBeNull();
  });

  it("mengirim ke Resend dengan semua penerima", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const notify = emailNotifier({ apiKey: "kunci-uji", to: "a@x.test, b@x.test", from: "C <c@x.test>" }, fetchImpl)!;
    await expect(notify({ jenis: "webhook", judul: "Webhook gagal", detail: "detail" })).resolves.toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer kunci-uji");
    expect(JSON.parse(init.body)).toMatchObject({ to: ["a@x.test", "b@x.test"], subject: "[Connectiv] Webhook gagal" });
  });

  it("melempar error jika Resend menolak", async () => {
    const notify = emailNotifier({ apiKey: "k", to: "a@x.test", from: "c@x.test" }, vi.fn().mockResolvedValue({ ok: false, status: 401 }))!;
    await expect(notify({ jenis: "webhook", judul: "x", detail: "y" })).rejects.toThrow("Resend 401");
  });
});

describe("raiseAlert", () => {
  function fakeAdmin(baru: boolean) {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: [{ id: 7, baru }], error: null }),
      from: vi.fn(() => ({ update })),
    };
    return { admin: admin as unknown as SupabaseClient, raw: admin, update };
  }

  it("mengirim notifikasi hanya untuk alert baru dan menandai email terkirim", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const notifier = vi.fn().mockResolvedValue(true);
    const fresh = fakeAdmin(true);
    expect(await raiseAlert(fresh.admin, { jenis: "cron_harian", judul: "Cron gagal", detail: "x" }, notifier)).toEqual({
      baru: true,
      emailed: true,
    });
    expect(fresh.update).toHaveBeenCalledWith({ email_terkirim: true });

    const repeat = fakeAdmin(false);
    expect(await raiseAlert(repeat.admin, { jenis: "cron_harian", judul: "Cron gagal", detail: "x" }, notifier)).toEqual({
      baru: false,
      emailed: false,
    });
    expect(notifier).toHaveBeenCalledTimes(1);
  });

  it("kegagalan notifier tidak melempar error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = fakeAdmin(true);
    const notifier = vi.fn().mockRejectedValue(new Error("down"));
    await expect(raiseAlert(admin, { jenis: "webhook", judul: "x", detail: "y" }, notifier)).resolves.toEqual({
      baru: true,
      emailed: false,
    });
  });
});
