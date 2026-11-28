import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createSourceResolver,
  downloadPendingMedia,
  DUALHOOK_BASE_URL,
  extensionFor,
  fetchMedia,
  MAX_MEDIA_ATTEMPTS,
  MAX_MEDIA_BYTES,
  MediaDownloadError,
  MISSING_KEY_ERROR,
  parseDualhookKeys,
} from "@/lib/whatsapp/media";

// Unit test pengunduh media tanpa jaringan dan database: fetch dan client
// Supabase dipalsukan.

const bytes = new Uint8Array([1, 2, 3, 4]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function binary(data: Uint8Array, type = "image/jpeg") {
  return new Response(data as BodyInit, { status: 200, headers: { "content-type": type } });
}

type Call = { url: string; auth: string | null };

function fakeFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    return handler(url);
  });
  return { fn, calls };
}

const graph = { kind: "graph", token: "graph-token", graphVersion: "v27.0" } as const;
const dualhook = { kind: "dualhook", apiKey: "dh_live_uji" } as const;

describe("parseDualhookKeys / createSourceResolver", () => {
  it("membaca daftar phone_number_id:api_key dan mengabaikan entri rusak", () => {
    const keys = parseDualhookKeys(" 111:dh_live_a , 222:dh_live_b,rusak,:x,333: ");
    expect([...keys]).toEqual([
      ["111", "dh_live_a"],
      ["222", "dh_live_b"],
    ]);
  });

  it("nomor dengan API key Dualhook memakai Dualhook, lainnya Graph, tanpa kunci = null", () => {
    const resolve = createSourceResolver({
      DUALHOOK_API_KEYS: "111:dh_live_a",
      WHATSAPP_ACCESS_TOKEN: "tok",
      META_GRAPH_VERSION: "v27.0",
    });
    expect(resolve("111")).toEqual({ kind: "dualhook", apiKey: "dh_live_a" });
    expect(resolve("999")).toEqual({ kind: "graph", token: "tok", graphVersion: "v27.0" });
    const none = createSourceResolver({ DUALHOOK_API_KEYS: "111:dh_live_a", META_GRAPH_VERSION: "v27.0" });
    expect(none("999")).toBeNull();
    expect(none(null)).toBeNull();
  });
});

describe("fetchMedia: Graph API", () => {
  it("ambil info lalu unduh URL dengan bearer token", async () => {
    const { fn, calls } = fakeFetch((url) =>
      url.includes("graph.facebook.com")
        ? json({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", mime_type: "image/jpeg", file_size: 4 })
        : binary(bytes),
    );
    const media = await fetchMedia(graph, "123", fn);
    expect(media).toEqual({ bytes, mime: "image/jpeg", size: 4 });
    expect(calls).toEqual([
      { url: "https://graph.facebook.com/v27.0/123", auth: "Bearer graph-token" },
      { url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", auth: "Bearer graph-token" },
    ]);
  });

  it("media id kedaluwarsa (error 100) = final", async () => {
    const { fn } = fakeFetch(() => json({ error: { code: 100, message: "Unsupported get request" } }, 400));
    await expect(fetchMedia(graph, "123", fn)).rejects.toMatchObject({ final: true });
  });

  it("token salah (401) dan 5xx = bisa diulang, pesan tanpa token", async () => {
    const { fn } = fakeFetch(() => json({ error: { code: 190, message: "Invalid OAuth access token" } }, 401));
    const err = await fetchMedia(graph, "123", fn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MediaDownloadError);
    expect(err).toMatchObject({ final: false });
    expect((err as Error).message).not.toContain("graph-token");

    const down = fakeFetch(() => new Response("bad gateway", { status: 502 }));
    await expect(fetchMedia(graph, "123", down.fn)).rejects.toMatchObject({ final: false });
  });

  it("gangguan jaringan = bisa diulang", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchMedia(graph, "123", fn)).rejects.toMatchObject({ final: false, message: "jaringan: fetch failed" });
  });

  it("file di atas 50 MB ditolak sebelum diunduh", async () => {
    const { fn, calls } = fakeFetch(() => json({ url: "https://x.test/f", file_size: MAX_MEDIA_BYTES + 1 }));
    await expect(fetchMedia(graph, "123", fn)).rejects.toMatchObject({ final: true });
    expect(calls).toHaveLength(1);
  });

  it("media id aneh tidak pernah dimasukkan ke URL", async () => {
    const { fn } = fakeFetch(() => json({}));
    await expect(fetchMedia(graph, "../me?x=1", fn)).rejects.toMatchObject({ final: true });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("fetchMedia: Dualhook Runtime API", () => {
  it("info lalu /content di domain Dualhook dengan API key, abaikan URL dari respons", async () => {
    const { fn, calls } = fakeFetch((url) =>
      url.endsWith("/content")
        ? binary(bytes, "audio/ogg")
        : json({ url: "https://elsewhere.example/steal", mime_type: "audio/ogg; codecs=opus", file_size: 4 }),
    );
    const media = await fetchMedia(dualhook, "555", fn);
    expect(media).toEqual({ bytes, mime: "audio/ogg; codecs=opus", size: 4 });
    expect(calls).toEqual([
      { url: `${DUALHOOK_BASE_URL}/555`, auth: "Bearer dh_live_uji" },
      { url: `${DUALHOOK_BASE_URL}/555/content`, auth: "Bearer dh_live_uji" },
    ]);
  });

  it("media tidak lagi dilayani Meta = final; koneksi ditahan / rate limit = diulang", async () => {
    const gone = fakeFetch(() => json({ error: { message: "Credential is not valid for this media object" } }, 403));
    await expect(fetchMedia(dualhook, "555", gone.fn)).rejects.toMatchObject({ final: true });

    const rejected = fakeFetch(() =>
      json({ error: { message: "This object was recently rejected by Meta as an invalid media ID" } }, 429),
    );
    await expect(fetchMedia(dualhook, "555", rejected.fn)).rejects.toMatchObject({ final: true });

    const hold = fakeFetch(() => json({ error: { code: "connection_not_routable", reason: "hold" } }, 403));
    await expect(fetchMedia(dualhook, "555", hold.fn)).rejects.toMatchObject({ final: false });

    const limited = fakeFetch(() => json({ error: { message: "Too many requests" } }, 429));
    await expect(fetchMedia(dualhook, "555", limited.fn)).rejects.toMatchObject({ final: false });

    const badKey = fakeFetch(() => json({ error: { message: "Invalid credential" } }, 401));
    await expect(fetchMedia(dualhook, "555", badKey.fn)).rejects.toMatchObject({ final: false });
  });

  it("mime dari content-type jika info tidak menyebutnya", async () => {
    const { fn } = fakeFetch((url) => (url.endsWith("/content") ? binary(bytes, "video/mp4; x=1") : json({})));
    expect((await fetchMedia(dualhook, "555", fn)).mime).toBe("video/mp4");
  });
});

describe("extensionFor", () => {
  it("dari nama file, lalu mime, lalu bin", () => {
    expect(extensionFor("application/pdf", "Invoice.PDF")).toBe("pdf");
    expect(extensionFor("audio/ogg; codecs=opus", null)).toBe("ogg");
    expect(extensionFor("image/webp", null)).toBe("webp");
    expect(extensionFor(null, null)).toBe("bin");
  });
});

// ---------------------------------------------------------------------------
// downloadPendingMedia dengan client Supabase palsu
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  workspace_id: string;
  media_id: string;
  media_mime: string | null;
  nama_file: string | null;
  media_percobaan: number;
  wa_numbers: { phone_number_id: string } | null;
};

function fakeAdmin(rows: Row[], options: { uploadError?: string } = {}) {
  const updates: { id: string | null; values: Record<string, unknown> }[] = [];
  const uploads: { path: string; contentType?: string }[] = [];
  const filters: string[][] = [];

  const builder = (kind: "select" | "update", values?: Record<string, unknown>) => {
    const applied: string[] = [];
    let id: string | null = null;
    const b: Record<string, unknown> = {};
    for (const method of ["not", "is", "or", "lt", "order", "limit", "in", "select"]) {
      b[method] = (...args: unknown[]) => {
        applied.push(`${method}:${String(args[0])}`);
        return b;
      };
    }
    b.eq = (_col: string, value: string) => {
      id = value;
      return b;
    };
    b.returns = () => b;
    b.then = (resolve: (v: unknown) => void) => {
      filters.push(applied);
      if (kind === "select") return resolve({ data: rows, error: null });
      if (id === null) return resolve({ count: 0, error: null }); // update massal "kedaluwarsa"
      updates.push({ id, values: values! });
      return resolve({ error: null });
    };
    return b;
  };

  const admin = {
    from: () => ({
      select: () => builder("select"),
      update: (values: Record<string, unknown>) => builder("update", values),
    }),
    storage: {
      from: () => ({
        upload: async (path: string, _body: unknown, opts: { contentType?: string }) => {
          uploads.push({ path, contentType: opts.contentType });
          return { error: options.uploadError ? { message: options.uploadError } : null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { admin, updates, uploads, filters };
}

const row = (over: Partial<Row> = {}): Row => ({
  id: "m1",
  workspace_id: "ws1",
  media_id: "123",
  media_mime: "image/jpeg",
  nama_file: null,
  media_percobaan: 0,
  wa_numbers: { phone_number_id: "111" },
  ...over,
});

const env = { DUALHOOK_API_KEYS: "111:dh_live_a", META_GRAPH_VERSION: "v27.0" };

describe("downloadPendingMedia", () => {
  it("unggah ke <workspace>/<pesan>.<ext> lalu tandai tersimpan", async () => {
    const { admin, updates, uploads } = fakeAdmin([row(), row({ id: "m2", media_mime: null, nama_file: "a.pdf" })]);
    const { fn } = fakeFetch((url) => (url.endsWith("/content") ? binary(bytes, "application/pdf") : json({})));
    const result = await downloadPendingMedia(admin, { env, fetchImpl: fn, concurrency: 1 });
    expect(result).toMatchObject({ attempted: 2, stored: 2, failed: 0, unavailable: 0 });
    expect(uploads).toEqual([
      { path: "ws1/m1.jpg", contentType: "image/jpeg" },
      { path: "ws1/m2.pdf", contentType: "application/pdf" },
    ]);
    expect(updates[0]).toMatchObject({
      id: "m1",
      values: { media_path: "ws1/m1.jpg", media_status: "tersimpan", media_size: 4, media_percobaan: 1, media_error: null },
    });
  });

  it("tanpa kunci akses: gagal dengan alasan jelas, percobaan tidak bertambah, tanpa fetch", async () => {
    const { admin, updates } = fakeAdmin([row({ wa_numbers: { phone_number_id: "999" } })]);
    const { fn } = fakeFetch(() => json({}));
    const result = await downloadPendingMedia(admin, { env, fetchImpl: fn });
    expect(result).toMatchObject({ attempted: 0, missingKey: 1 });
    expect(fn).not.toHaveBeenCalled();
    expect(updates).toEqual([{ id: "m1", values: { media_status: "gagal", media_error: MISSING_KEY_ERROR } }]);
  });

  it("error sementara = gagal (diulang cron); percobaan terakhir atau error final = tidak_tersedia", async () => {
    const { admin, updates } = fakeAdmin([
      row({ id: "a" }),
      row({ id: "b", media_percobaan: MAX_MEDIA_ATTEMPTS - 1 }),
    ]);
    const { fn } = fakeFetch(() => new Response("unavailable", { status: 503 }));
    const result = await downloadPendingMedia(admin, { env, fetchImpl: fn, concurrency: 1 });
    expect(result).toMatchObject({ failed: 1, unavailable: 1 });
    expect(updates.map((u) => [u.id, u.values.media_status, u.values.media_percobaan])).toEqual([
      ["a", "gagal", 1],
      ["b", "tidak_tersedia", MAX_MEDIA_ATTEMPTS],
    ]);

    const final = fakeAdmin([row()]);
    const gone = fakeFetch(() => json({ error: { message: "Credential is not valid for this media object" } }, 403));
    await downloadPendingMedia(final.admin, { env, fetchImpl: gone.fn });
    expect(final.updates[0]!.values).toMatchObject({ media_status: "tidak_tersedia", media_percobaan: 1 });
    expect(String(final.updates[0]!.values.media_error)).toContain("HTTP 403");
  });

  it("upload Storage gagal dicatat, tidak melempar", async () => {
    const { admin, updates } = fakeAdmin([row()], { uploadError: "The object exceeded the maximum allowed size" });
    const { fn } = fakeFetch((url) => (url.endsWith("/content") ? binary(bytes) : json({})));
    const result = await downloadPendingMedia(admin, { env, fetchImpl: fn });
    expect(result.unavailable).toBe(1);
    expect(updates[0]!.values.media_status).toBe("tidak_tersedia");
  });

  it("berhenti saat deadline lewat; daftar pesan kosong tidak menyentuh DB", async () => {
    const { admin, uploads } = fakeAdmin([row()]);
    const { fn } = fakeFetch(() => json({}));
    const result = await downloadPendingMedia(admin, { env, fetchImpl: fn, deadline: 0, now: () => 1 });
    expect(result.timedOut).toBe(true);
    expect(uploads).toEqual([]);

    const empty = fakeAdmin([row()]);
    const r = await downloadPendingMedia(empty.admin, { env, waMessageIds: [] });
    expect(r.attempted).toBe(0);
    expect(empty.filters).toEqual([]);
  });
});
