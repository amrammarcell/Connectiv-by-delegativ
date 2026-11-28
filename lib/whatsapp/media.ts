import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";

// Unduh media WhatsApp (gambar, voice note, video, dokumen, stiker) ke bucket
// Storage privat `media`. Media id dari Meta kedaluwarsa ±7 hari, jadi
// diunduh segera setelah ingest (after() di route webhook) dan diulang oleh
// cron harian untuk yang gagal.
//
// Dua sumber di balik satu antarmuka:
// - Dualhook: Runtime API (https://api.dualhook.com), API key per koneksi.
// - Nomor resmi (Tech Provider, wa_numbers.sumber = 'resmi'): Graph API dengan
//   token bisnis per WABA (wa_business_tokens, terenkripsi).
// - Nomor lain: Graph API dengan token system user (WHATSAPP_ACCESS_TOKEN).

export const MEDIA_BUCKET = "media";
// Batas ukuran file global Supabase paket gratis.
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MAX_MEDIA_ATTEMPTS = 5;
// Media id masuk kedaluwarsa 7 hari setelah dikirim Meta.
export const MEDIA_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DUALHOOK_BASE_URL = "https://api.dualhook.com/v25.0";

export type MediaSource =
  | { kind: "graph"; token: string; graphVersion: string }
  | { kind: "dualhook"; apiKey: string };

export type MediaEnvValues = {
  WHATSAPP_ACCESS_TOKEN?: string;
  DUALHOOK_API_KEYS?: string;
  META_GRAPH_VERSION: string;
};

// final = tidak ada gunanya diulang (media id kedaluwarsa/ditolak, terlalu besar).
export class MediaDownloadError extends Error {
  constructor(
    message: string,
    readonly final: boolean,
  ) {
    super(message);
    this.name = "MediaDownloadError";
  }
}

export type FetchedMedia = { bytes: Uint8Array; mime: string | null; size: number };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// "<phone_number_id>:<api_key>,..." → Map. Entri yang rusak diabaikan.
export function parseDualhookKeys(raw: string | undefined): Map<string, string> {
  const keys = new Map<string, string>();
  for (const part of (raw ?? "").split(",")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const id = part.slice(0, i).trim();
    const key = part.slice(i + 1).trim();
    if (/^\d+$/.test(id) && key) keys.set(id, key);
  }
  return keys;
}

export type NumberInfo = { phone_number_id: string; waba_id?: string | null; sumber?: string | null };

// Token bisnis per WABA untuk nomor resmi; null = tidak ada.
export type BusinessTokenLookup = (wabaId: string) => Promise<string | null>;

export function createSourceResolver(env: MediaEnvValues, businessToken?: BusinessTokenLookup) {
  const dualhook = parseDualhookKeys(env.DUALHOOK_API_KEYS);
  const tokens = new Map<string, Promise<string | null>>();
  return async (number: NumberInfo | null | undefined): Promise<MediaSource | null> => {
    if (number?.sumber === "resmi" && number.waba_id && businessToken) {
      if (!tokens.has(number.waba_id)) tokens.set(number.waba_id, businessToken(number.waba_id).catch(() => null));
      const token = await tokens.get(number.waba_id)!;
      if (token) return { kind: "graph", token, graphVersion: env.META_GRAPH_VERSION };
    }
    const phoneNumberId = number?.phone_number_id;
    const apiKey = phoneNumberId ? dualhook.get(phoneNumberId) : undefined;
    if (apiKey) return { kind: "dualhook", apiKey };
    if (env.WHATSAPP_ACCESS_TOKEN) {
      return { kind: "graph", token: env.WHATSAPP_ACCESS_TOKEN, graphVersion: env.META_GRAPH_VERSION };
    }
    return null;
  };
}

type ErrorBody = { error?: { code?: number | string; error_subcode?: number; message?: string } };

async function readError(res: Response): Promise<ErrorBody["error"]> {
  try {
    return ((await res.json()) as ErrorBody).error ?? {};
  } catch {
    return {};
  }
}

// Petakan respons gagal ke error final / sementara. Pesan tidak pernah memuat
// token atau URL bertanda tangan.
async function toError(res: Response, source: MediaSource["kind"], step: string): Promise<MediaDownloadError> {
  const err = await readError(res);
  const message = String(err?.message ?? "");
  const label = source === "dualhook" ? "Dualhook" : "Meta";
  const summary = `${label} ${step}: HTTP ${res.status}${message ? ` (${message.slice(0, 160)})` : ""}`;

  // Media id tidak lagi dilayani Meta (kedaluwarsa / tidak valid).
  const invalidMedia =
    (Number(err?.code) === 100 && (err?.error_subcode === 33 || source === "graph")) ||
    /not valid for this media object|invalid media id|recently rejected/i.test(message) ||
    res.status === 404;
  if (invalidMedia) return new MediaDownloadError(summary, true);
  if (res.status === 413) return new MediaDownloadError(summary, true);
  // 401/403 (kunci salah/dicabut, koneksi ditahan), 429, 5xx: coba lagi nanti.
  return new MediaDownloadError(summary, false);
}

type MediaInfo = { url?: string; mime_type?: string; file_size?: number | string };

async function fetchJson(fetchImpl: FetchLike, url: string, auth: string, source: MediaSource["kind"]) {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Authorization: auth }, cache: "no-store" });
  } catch (err) {
    throw new MediaDownloadError(`jaringan: ${err instanceof Error ? err.message : String(err)}`, false);
  }
  if (!res.ok) throw await toError(res, source, "info media");
  return (await res.json()) as MediaInfo;
}

async function fetchBytes(
  fetchImpl: FetchLike,
  url: string,
  auth: string,
  source: MediaSource["kind"],
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Authorization: auth }, cache: "no-store" });
  } catch (err) {
    throw new MediaDownloadError(`jaringan: ${err instanceof Error ? err.message : String(err)}`, false);
  }
  if (!res.ok) throw await toError(res, source, "unduh media");
  const length = Number(res.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_MEDIA_BYTES) throw tooLarge(length);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw tooLarge(bytes.byteLength);
  if (bytes.byteLength === 0) throw new MediaDownloadError("file media kosong", false);
  return { bytes, contentType: res.headers.get("content-type") };
}

function tooLarge(size: number) {
  return new MediaDownloadError(`file terlalu besar (${Math.round(size / 1024 / 1024)} MB, batas 50 MB)`, true);
}

// Ambil isi media dari sumbernya. Selalu dua langkah (info lalu isi) seperti
// Graph API; Dualhook memakai bentuk yang sama di domainnya sendiri.
export async function fetchMedia(
  source: MediaSource,
  mediaId: string,
  fetchImpl: FetchLike = fetch,
): Promise<FetchedMedia> {
  if (!/^[\w.-]+$/.test(mediaId)) throw new MediaDownloadError("media id tidak valid", true);

  if (source.kind === "dualhook") {
    const auth = `Bearer ${source.apiKey}`;
    const info = await fetchJson(fetchImpl, `${DUALHOOK_BASE_URL}/${mediaId}`, auth, "dualhook");
    checkDeclaredSize(info);
    // URL isi selalu route Dualhook; dibangun sendiri supaya API key tidak
    // pernah dikirim ke host lain.
    const { bytes, contentType } = await fetchBytes(fetchImpl, `${DUALHOOK_BASE_URL}/${mediaId}/content`, auth, "dualhook");
    return { bytes, mime: info.mime_type ?? cleanContentType(contentType), size: bytes.byteLength };
  }

  const auth = `Bearer ${source.token}`;
  const info = await fetchJson(fetchImpl, `https://graph.facebook.com/${source.graphVersion}/${mediaId}`, auth, "graph");
  checkDeclaredSize(info);
  if (!info.url || !info.url.startsWith("https://")) {
    throw new MediaDownloadError("Meta info media: URL unduh tidak ada", false);
  }
  const { bytes, contentType } = await fetchBytes(fetchImpl, info.url, auth, "graph");
  return { bytes, mime: info.mime_type ?? cleanContentType(contentType), size: bytes.byteLength };
}

function checkDeclaredSize(info: MediaInfo) {
  const size = Number(info.file_size);
  if (Number.isFinite(size) && size > MAX_MEDIA_BYTES) throw tooLarge(size);
}

function cleanContentType(value: string | null): string | null {
  const v = value?.split(";")[0]?.trim().toLowerCase();
  return v && v !== "application/octet-stream" ? v : null;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

// Ekstensi untuk path Storage: dari nama file asli, lalu dari mime.
export function extensionFor(mime: string | null, filename: string | null): string {
  const fromName = filename?.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const base = mime?.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXTENSIONS[base] ?? "bin";
}

// ---------------------------------------------------------------------------
// Antrean unduhan
// ---------------------------------------------------------------------------

type PendingRow = {
  id: string;
  workspace_id: string;
  media_id: string;
  media_mime: string | null;
  nama_file: string | null;
  media_percobaan: number;
  wa_numbers: NumberInfo | null;
};

export type MediaRunResult = {
  attempted: number;
  stored: number;
  failed: number;
  unavailable: number;
  // Tanpa kunci akses untuk nomornya: tidak dihitung sebagai percobaan.
  missingKey: number;
  expired: number;
  timedOut: boolean;
};

export const emptyMediaRunResult = (): MediaRunResult => ({
  attempted: 0,
  stored: 0,
  failed: 0,
  unavailable: 0,
  missingKey: 0,
  expired: 0,
  timedOut: false,
});

const PENDING_STATUS = "media_status.is.null,media_status.eq.menunggu,media_status.eq.gagal";
export const MISSING_KEY_ERROR = "Kunci akses media belum diisi untuk nomor ini";

export type DownloadOptions = {
  env: MediaEnvValues;
  // Token bisnis nomor resmi (lihat supabaseBusinessTokens).
  businessToken?: BusinessTokenLookup;
  // Batasi ke pesan tertentu (dari satu webhook). Kosong = semua yang tertunda.
  waMessageIds?: string[];
  limit?: number;
  deadline?: number;
  concurrency?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
};

// Unduh media yang belum tersimpan. Aman dipanggil bersamaan (upload upsert,
// path tetap per pesan). Tidak pernah melempar error per pesan: hasilnya
// dicatat di kolom media_status / media_error.
export async function downloadPendingMedia(admin: SupabaseClient, options: DownloadOptions): Promise<MediaRunResult> {
  const {
    env,
    businessToken,
    waMessageIds,
    limit = 200,
    deadline = Number.POSITIVE_INFINITY,
    concurrency = 3,
    fetchImpl = fetch,
    now = Date.now,
  } = options;
  const result = emptyMediaRunResult();
  if (waMessageIds && !waMessageIds.length) return result;

  // Media id yang sudah lewat 7 hari pasti ditolak: tandai tanpa memanggil API.
  const cutoff = new Date(now() - MEDIA_ID_TTL_MS).toISOString();
  let expire = admin
    .from("messages")
    .update(
      { media_status: "tidak_tersedia", media_error: "Media id kedaluwarsa (lebih dari 7 hari)" },
      { count: "exact" },
    )
    .not("media_id", "is", null)
    .is("media_path", null)
    .or(PENDING_STATUS)
    .lt("dibuat_pada", cutoff);
  if (waMessageIds) expire = expire.in("wa_message_id", waMessageIds);
  const { count: expiredCount, error: expireError } = await expire;
  if (expireError) throw new Error(`messages (kedaluwarsa): ${expireError.message}`);
  result.expired = expiredCount ?? 0;

  let query = admin
    .from("messages")
    .select("id, workspace_id, media_id, media_mime, nama_file, media_percobaan, wa_numbers(phone_number_id, waba_id, sumber)")
    .not("media_id", "is", null)
    .is("media_path", null)
    .or(PENDING_STATUS)
    .lt("media_percobaan", MAX_MEDIA_ATTEMPTS)
    .order("dibuat_pada")
    .limit(limit);
  if (waMessageIds) query = query.in("wa_message_id", waMessageIds);
  const { data, error } = await query.returns<PendingRow[]>();
  if (error) throw new Error(`messages (media tertunda): ${error.message}`);

  const resolve = createSourceResolver(env, businessToken);
  const rows = [...(data ?? [])];

  const worker = async () => {
    for (let row = rows.shift(); row; row = rows.shift()) {
      if (now() > deadline) {
        result.timedOut = true;
        return;
      }
      await downloadOne(admin, row, await resolve(row.wa_numbers), fetchImpl, result);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return result;
}

async function downloadOne(
  admin: SupabaseClient,
  row: PendingRow,
  source: MediaSource | null,
  fetchImpl: FetchLike,
  result: MediaRunResult,
) {
  const update = (values: Record<string, unknown>) => admin.from("messages").update(values).eq("id", row.id);

  if (!source) {
    result.missingKey++;
    await update({ media_status: "gagal", media_error: MISSING_KEY_ERROR });
    return;
  }

  result.attempted++;
  const attempts = row.media_percobaan + 1;
  try {
    const media = await fetchMedia(source, row.media_id, fetchImpl);
    const mime = row.media_mime ?? media.mime;
    const path = `${row.workspace_id}/${row.id}.${extensionFor(mime, row.nama_file)}`;
    const { error: uploadError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, media.bytes, { contentType: mime ?? "application/octet-stream", upsert: true });
    if (uploadError) {
      const big = /too large|exceeded the maximum|payload too large/i.test(uploadError.message);
      throw new MediaDownloadError(`Storage: ${uploadError.message}`, big);
    }
    const { error } = await update({
      media_path: path,
      media_status: "tersimpan",
      media_size: media.size,
      media_mime: mime,
      media_percobaan: attempts,
      media_error: null,
      media_diunduh_pada: new Date().toISOString(),
    });
    if (error) throw new MediaDownloadError(`messages: ${error.message}`, false);
    result.stored++;
  } catch (err) {
    const final = err instanceof MediaDownloadError ? err.final : false;
    const message = err instanceof Error ? err.message : String(err);
    const unavailable = final || attempts >= MAX_MEDIA_ATTEMPTS;
    if (unavailable) result.unavailable++;
    else result.failed++;
    await update({
      media_status: unavailable ? "tidak_tersedia" : "gagal",
      media_percobaan: attempts,
      media_error: message.slice(0, 500),
    });
  }
}

// ---------------------------------------------------------------------------
// Detail media yang menyusul (riwayat chat: media_placeholder)
// ---------------------------------------------------------------------------

export type MediaDetail = {
  wa_message_id: string;
  tipe: string;
  media_id: string;
  media_mime: string | null;
  nama_file: string | null;
  isi: string | null;
};

// Melengkapi pesan yang sudah ada tanpa media id. Mengembalikan jumlah baris.
export async function attachMediaDetails(admin: SupabaseClient, items: MediaDetail[]): Promise<number> {
  if (!items.length) return 0;
  const { data, error } = await admin.rpc("attach_media_details", { p_items: items });
  if (error) throw new Error(`attach_media_details: ${error.message}`);
  return (data as number) ?? 0;
}

// Token bisnis per WABA dari wa_business_tokens (jalur resmi), didekripsi
// dengan WHATSAPP_TOKEN_ENCRYPTION_KEY. Hanya untuk client secret key.
export function supabaseBusinessTokens(admin: SupabaseClient, encryptionKey: string): BusinessTokenLookup {
  return async (wabaId) => {
    const { data, error } = await admin
      .from("wa_business_tokens")
      .select("token_terenkripsi")
      .eq("waba_id", wabaId)
      .maybeSingle<{ token_terenkripsi: string }>();
    if (error || !data?.token_terenkripsi) return null;
    return decryptSecret(data.token_terenkripsi, encryptionKey);
  };
}
