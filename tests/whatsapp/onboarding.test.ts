import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/crypto";
import { exchangeCode, GraphError, requestSmbAppData, subscribeApp } from "@/lib/whatsapp/graph";
import {
  onboardWaba,
  runPendingSyncs,
  SYNC_WINDOW_MS,
  type NumberRow,
  type OnboardingStore,
  type SyncCandidate,
  type SyncKind,
  type TechProviderConfig,
} from "@/lib/whatsapp/onboarding";
import { accountUpdateApplies, applyAccountUpdates } from "@/lib/whatsapp/processor";

// Alur jalur resmi dengan Graph API tiruan (fetch) dan penyimpanan di memori.

type Call = { method: string; path: string; query: Record<string, string>; auth: string | null; body: unknown };

function fakeGraph(handlers: Record<string, (c: Call) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, "");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      method: init?.method ?? "GET",
      path,
      query: Object.fromEntries(url.searchParams),
      auth: headers.authorization ?? null,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const key = `${call.method} ${path}`;
    const handler = handlers[key];
    const res = handler ? handler(call) : { status: 404, body: { error: { message: `tidak ada handler ${key}` } } };
    return new Response(JSON.stringify(res.body), { status: res.status ?? 200 });
  });
  return { calls, fetch: fetchFn as unknown as typeof fetch };
}

type MemNumber = NumberRow &
  SyncCandidate & { id: string; sumber: string; status: string; resmi_sejak: string | null; sync_error: string | null };

function memoryStore() {
  const tokens = new Map<string, { workspaceId: string; encrypted: string }>();
  const numbers: MemNumber[] = [];
  let seq = 0;
  const col = (k: SyncKind): "sync_kontak_status" | "sync_riwayat_status" =>
    k === "kontak" ? "sync_kontak_status" : "sync_riwayat_status";
  const store: OnboardingStore = {
    async tokenWorkspace(wabaId) {
      return tokens.get(wabaId)?.workspaceId ?? null;
    },
    async saveToken(row) {
      tokens.set(row.wabaId, { workspaceId: row.workspaceId, encrypted: row.encrypted });
    },
    async getEncryptedToken(wabaId) {
      return tokens.get(wabaId)?.encrypted ?? null;
    },
    async findNumber(pn) {
      const n = numbers.find((x) => x.phone_number_id === pn);
      return n ? { id: n.id, workspace_id: n.workspace_id } : null;
    },
    async insertResmiNumber(row, now) {
      const id = `n${++seq}`;
      numbers.push({ ...row, ...resmi(now), id, status: "aktif" });
      return id;
    },
    async reconnectResmiNumber(id, row, now) {
      const n = numbers.find((x) => x.id === id)!;
      Object.assign(n, { waba_id: row.waba_id, nomor_tampil: row.nomor_tampil, ...resmi(now), status: "aktif" });
    },
    async syncCandidates(ids) {
      return numbers.filter((n) => n.sumber === "resmi" && (!ids || ids.includes(n.id))).map((n) => ({ ...n }));
    },
    async claimSync(id, kind) {
      const n = numbers.find((x) => x.id === id)!;
      if (n[col(kind)] !== "belum" && n[col(kind)] !== "gagal") return false;
      n[col(kind)] = "memproses";
      return true;
    },
    async finishSync(id, kind, status, error) {
      const n = numbers.find((x) => x.id === id)!;
      n[col(kind)] = status;
      n.sync_error = error;
    },
  };
  return { store, tokens, numbers };
}

function resmi(now: Date) {
  return {
    sumber: "resmi",
    resmi_sejak: now.toISOString(),
    sync_kontak_status: "belum" as const,
    sync_riwayat_status: "belum" as const,
    sync_batas: new Date(now.getTime() + SYNC_WINDOW_MS).toISOString(),
    sync_error: null,
  };
}

const KEY = randomBytes(32).toString("base64");
const NOW = new Date(Date.UTC(2026, 10, 28, 3));

function okHandlers(overrides: Record<string, (c: Call) => { status?: number; body: unknown }> = {}) {
  return {
    "GET oauth/access_token": () => ({ body: { access_token: "BIZ-TOKEN", token_type: "bearer", expires_in: 5_184_000 } }),
    "GET 111/phone_numbers": () => ({
      body: {
        data: [
          { id: "222", display_phone_number: "+62 812-0000-0001", verified_name: "Toko Maju", is_on_biz_app: true, platform_type: "CLOUD_API" },
        ],
      },
    }),
    "POST 111/subscribed_apps": () => ({ body: { success: true } }),
    "POST 222/smb_app_data": () => ({ body: { messaging_product: "whatsapp", request_id: "req" } }),
    ...overrides,
  };
}

function configWith(fetchFn: typeof fetch): TechProviderConfig {
  return { appId: "123456", appSecret: "app-secret-xyz-123456", encryptionKey: KEY, graph: { graphVersion: "v27.0", fetch: fetchFn } };
}

const input = { workspaceId: "ws-a", userId: "u1", code: "AQB-code-from-fb-login", wabaId: "111", phoneNumberId: null };

describe("Graph API", () => {
  it("exchangeCode memakai app secret di query, bukan di error", async () => {
    const g = fakeGraph({
      "GET oauth/access_token": (c) =>
        c.query.code === "baik"
          ? { body: { access_token: "T", expires_in: 60 } }
          : { status: 400, body: { error: { message: "Invalid verification code format.", code: 100 } } },
    });
    const opts = { graphVersion: "v27.0", fetch: g.fetch };
    const t = await exchangeCode("baik", { appId: "1", appSecret: "SECRET" }, opts, 1_000);
    expect(t).toEqual({ accessToken: "T", expiresAt: new Date(61_000) });
    expect(g.calls[0]!.query).toEqual({ client_id: "1", client_secret: "SECRET", code: "baik" });

    const err = await exchangeCode("buruk", { appId: "1", appSecret: "SECRET" }, opts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect((err as GraphError).message).toContain("Invalid verification code");
    expect((err as GraphError).message).not.toContain("SECRET");
  });

  it("subscribeApp dan requestSmbAppData mengirim token bisnis dan body yang benar", async () => {
    const g = fakeGraph(okHandlers());
    const opts = { graphVersion: "v27.0", fetch: g.fetch };
    await subscribeApp("111", "BIZ", opts);
    expect(await requestSmbAppData("222", "history", "BIZ", opts)).toBe("req");
    expect(g.calls.map((c) => [c.method, c.path, c.auth])).toEqual([
      ["POST", "111/subscribed_apps", "Bearer BIZ"],
      ["POST", "222/smb_app_data", "Bearer BIZ"],
    ]);
    expect(g.calls[1]!.body).toEqual({ messaging_product: "whatsapp", sync_type: "history" });

    const failing = fakeGraph({ "POST 111/subscribed_apps": () => ({ body: { success: false } }) });
    await expect(subscribeApp("111", "BIZ", { graphVersion: "v27.0", fetch: failing.fetch })).rejects.toThrow(GraphError);
  });
});

describe("onboardWaba", () => {
  let mem: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    mem = memoryStore();
  });

  it("code → token terenkripsi → subscribed_apps → nomor resmi baru", async () => {
    const g = fakeGraph(okHandlers());
    const r = await onboardWaba(mem.store, input, configWith(g.fetch), NOW);

    expect(r.numbers).toEqual([{ id: "n1", label: "Toko Maju", phoneNumberId: "222", baru: true }]);
    expect(g.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET oauth/access_token",
      "GET 111/phone_numbers",
      "POST 111/subscribed_apps",
    ]);
    const saved = mem.tokens.get("111")!;
    expect(saved.encrypted).not.toContain("BIZ-TOKEN");
    expect(decryptSecret(saved.encrypted, KEY)).toBe("BIZ-TOKEN");
    expect(mem.numbers[0]).toMatchObject({
      workspace_id: "ws-a",
      sumber: "resmi",
      nomor_tampil: "+62 812-0000-0001",
      sync_kontak_status: "belum",
      sync_batas: new Date(NOW.getTime() + SYNC_WINDOW_MS).toISOString(),
    });
  });

  it("nomor lama (Dualhook) di workspace yang sama disambungkan ulang sebagai resmi", async () => {
    mem.numbers.push({
      id: "lama",
      workspace_id: "ws-a",
      phone_number_id: "222",
      waba_id: "999",
      label: "CS Anggun",
      nomor_tampil: null,
      sumber: "dualhook",
      status: "terputus",
      resmi_sejak: null,
      sync_kontak_status: null,
      sync_riwayat_status: null,
      sync_batas: null,
      sync_error: null,
    });
    const r = await onboardWaba(mem.store, input, configWith(fakeGraph(okHandlers()).fetch), NOW);
    expect(r.numbers[0]).toMatchObject({ id: "lama", baru: false });
    expect(mem.numbers[0]).toMatchObject({ label: "CS Anggun", waba_id: "111", sumber: "resmi", status: "aktif", resmi_sejak: NOW.toISOString() });
  });

  it("menolak WABA atau nomor milik workspace lain, sebelum subscribe", async () => {
    mem.tokens.set("111", { workspaceId: "ws-b", encrypted: "x" });
    const g = fakeGraph(okHandlers());
    await expect(onboardWaba(mem.store, input, configWith(g.fetch), NOW)).rejects.toThrow(/workspace lain/);
    expect(g.calls.some((c) => c.path.endsWith("subscribed_apps"))).toBe(false);

    const mem2 = memoryStore();
    await mem2.store.insertResmiNumber({ workspace_id: "ws-b", phone_number_id: "222", waba_id: "5", label: "B", nomor_tampil: null }, NOW);
    await expect(onboardWaba(mem2.store, input, configWith(fakeGraph(okHandlers()).fetch), NOW)).rejects.toThrow(/workspace lain/);
    expect(mem2.tokens.size).toBe(0);
  });

  it("code kedaluwarsa: tidak ada yang disimpan", async () => {
    const g = fakeGraph(okHandlers({ "GET oauth/access_token": () => ({ status: 400, body: { error: { message: "code expired" } } }) }));
    await expect(onboardWaba(mem.store, input, configWith(g.fetch), NOW)).rejects.toThrow(/oauth\/access_token/);
    expect(mem.tokens.size).toBe(0);
    expect(mem.numbers).toHaveLength(0);
  });
});

describe("runPendingSyncs", () => {
  async function onboarded(handlers = okHandlers()) {
    const mem = memoryStore();
    const g = fakeGraph(handlers);
    await onboardWaba(mem.store, input, configWith(g.fetch), NOW);
    g.calls.length = 0;
    return { mem, g, config: configWith(g.fetch) };
  }

  it("kontak lalu riwayat, masing-masing sekali; panggilan ulang tidak memanggil Meta lagi", async () => {
    const { mem, g, config } = await onboarded();
    const out = await runPendingSyncs(mem.store, config, null, new Date(NOW.getTime() + 60_000));
    expect(out.map((o) => [o.kind, o.status])).toEqual([
      ["kontak", "diminta"],
      ["riwayat", "diminta"],
    ]);
    expect(g.calls.map((c) => (c.body as { sync_type: string }).sync_type)).toEqual(["smb_app_state_sync", "history"]);
    expect(g.calls.every((c) => c.auth === "Bearer BIZ-TOKEN")).toBe(true);

    expect(await runPendingSyncs(mem.store, config, null, new Date(NOW.getTime() + 120_000))).toEqual([]);
    expect(g.calls).toHaveLength(2);
  });

  it("kontak gagal → riwayat tidak diminta; coba lagi melanjutkan dari kontak", async () => {
    let fail = true;
    const { mem, g, config } = await onboarded(
      okHandlers({
        "POST 222/smb_app_data": () =>
          fail ? { status: 400, body: { error: { message: "Temporarily unavailable" } } } : { body: { request_id: "r" } },
      }),
    );
    const out = await runPendingSyncs(mem.store, config, ["n1"], NOW);
    expect(out).toEqual([{ id: "n1", kind: "kontak", status: "gagal", error: expect.stringContaining("Temporarily") }]);
    expect(mem.numbers[0]).toMatchObject({ sync_kontak_status: "gagal", sync_riwayat_status: "belum" });
    expect(g.calls).toHaveLength(1);

    fail = false;
    const retry = await runPendingSyncs(mem.store, config, ["n1"], NOW);
    expect(retry.map((o) => o.status)).toEqual(["diminta", "diminta"]);
    expect(mem.numbers[0]).toMatchObject({ sync_kontak_status: "diminta", sync_riwayat_status: "diminta", sync_error: null });
  });

  it("lewat 24 jam: tidak memanggil Meta, dilaporkan kedaluwarsa", async () => {
    const { mem, g, config } = await onboarded();
    const out = await runPendingSyncs(mem.store, config, null, new Date(NOW.getTime() + SYNC_WINDOW_MS + 1));
    expect(out).toEqual([{ id: "n1", kind: "kontak", status: "kedaluwarsa" }]);
    expect(g.calls).toHaveLength(0);
  });

  it("nomor yang sedang diproses proses lain (klaim gagal) dilewati", async () => {
    const { mem, g, config } = await onboarded();
    mem.numbers[0]!.sync_kontak_status = "memproses";
    expect(await runPendingSyncs(mem.store, config, null, NOW)).toEqual([]);
    expect(g.calls).toHaveLength(0);
  });
});

describe("account_update saat pindah dari Dualhook ke jalur resmi", () => {
  const resmiSejak = "2026-11-28T03:00:00.000Z";
  const resmiNumber = { sumber: "resmi", resmi_sejak: resmiSejak };

  it("accountUpdateApplies", () => {
    // Nomor Dualhook: perilaku lama.
    expect(accountUpdateApplies({ sumber: "dualhook", resmi_sejak: null }, "terputus", { sumber: "dualhook" })).toBe(true);
    expect(accountUpdateApplies({}, "terputus", {})).toBe(true);
    // PARTNER_REMOVED dari Dualhook tidak memutus nomor resmi.
    expect(accountUpdateApplies(resmiNumber, "terputus", { sumber: "dualhook", receivedAt: "2026-11-29T00:00:00Z" })).toBe(false);
    // Event app kita sendiri: hanya yang diterima setelah disambungkan ulang.
    expect(accountUpdateApplies(resmiNumber, "terputus", { sumber: "whatsapp", receivedAt: "2026-11-28T02:59:00Z" })).toBe(false);
    expect(accountUpdateApplies(resmiNumber, "terputus", { sumber: "whatsapp", receivedAt: "2026-11-28T04:00:00Z" })).toBe(true);
  });

  function fakeAdmin(rows: Record<string, unknown>[]) {
    const updated: string[][] = [];
    const admin = {
      from: () => ({
        select: () => {
          const q = {
            eq: (_c: string, v: string) => ({ then: (r: (x: unknown) => void) => r({ data: rows.filter((x) => x.waba_id === v), error: null }) }),
          };
          return q;
        },
        update: () => ({
          in: async (_c: string, ids: string[]) => {
            updated.push(ids);
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    return { admin, updated };
  }

  it("applyAccountUpdates hanya menandai nomor Dualhook di WABA yang sama", async () => {
    const { admin, updated } = fakeAdmin([
      { id: "dh", waba_id: "W", nomor_tampil: null, sumber: "dualhook", resmi_sejak: null },
      { id: "rs", waba_id: "W", nomor_tampil: null, sumber: "resmi", resmi_sejak: resmiSejak },
    ]);
    const n = await applyAccountUpdates(admin, [{ event: "PARTNER_REMOVED", wabaId: "W", phoneNumber: null }], {
      sumber: "dualhook",
      receivedAt: "2026-11-29T00:00:00Z",
    });
    expect(n).toBe(1);
    expect(updated).toEqual([["dh"]]);
  });

  it("semua nomor sudah resmi: tidak ada yang diubah", async () => {
    const { admin, updated } = fakeAdmin([{ id: "rs", waba_id: "W", nomor_tampil: null, sumber: "resmi", resmi_sejak: resmiSejak }]);
    expect(await applyAccountUpdates(admin, [{ event: "PARTNER_REMOVED", wabaId: "W", phoneNumber: null }], { sumber: "dualhook" })).toBe(0);
    expect(updated).toEqual([]);
  });
});
