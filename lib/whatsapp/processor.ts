import type { SupabaseClient } from "@supabase/supabase-js";
import { normalize, type AccountUpdate, type NormalizedMessage, type NormalizedUpdate } from "./adapter";
import { attachMediaDetails } from "./media";
import { parseEnvelope } from "./webhook";

// Processor: webhook_events (mentah) → kontak + pesan lewat fungsi SQL
// ingest_messages (banyak pesan per panggilan, satu transaksi per batch).
// Butuh client dengan secret key (melewati RLS).

export const MAX_ATTEMPTS = 5;
// Pesan per panggilan ingest_messages. Riwayat chat bisa ratusan pesan per
// webhook; 200 pesan selesai dalam ±1–2 detik di Postgres.
export const INGEST_BATCH_SIZE = 200;

export type IngestOutcome = "inserted" | "duplicate" | "unknown_number";

// Satu pesan lewat fungsi lama ingest_message. Dipertahankan untuk test dan
// kompatibilitas; processor memakai ingestBatch.
export async function ingestMessage(admin: SupabaseClient, m: NormalizedMessage): Promise<IngestOutcome> {
  const { data, error } = await admin.rpc("ingest_message", {
    p_phone_number_id: m.phoneNumberId,
    p_wa_message_id: m.waMessageId,
    p_arah: m.direction,
    p_customer_phone: m.customerPhone,
    p_customer_name: m.customerName,
    p_tipe: m.type,
    p_isi: m.text,
    p_media_id: m.media?.id ?? null,
    p_media_mime: m.media?.mime ?? null,
    p_nama_file: m.media?.filename ?? null,
    p_referral: m.referral,
    p_dikirim_pada: m.sentAt.toISOString(),
    p_dari_history: m.fromHistory,
  });
  if (error) throw new Error(`ingest_message: ${error.message}`);
  return data as IngestOutcome;
}

export type IngestItem = Record<string, unknown>;

export function toIngestItem(m: NormalizedMessage | NormalizedUpdate): IngestItem {
  if ("kind" in m) {
    return {
      kind: m.kind,
      phone_number_id: m.phoneNumberId,
      original_wa_message_id: m.originalWaMessageId,
      isi: m.text,
      pada: m.at.toISOString(),
    };
  }
  return {
    kind: "message",
    phone_number_id: m.phoneNumberId,
    wa_message_id: m.waMessageId,
    arah: m.direction,
    customer_phone: m.customerPhone,
    customer_name: m.customerName,
    tipe: m.type,
    isi: m.text,
    media_id: m.media?.id ?? null,
    media_mime: m.media?.mime ?? null,
    nama_file: m.media?.filename ?? null,
    referral: m.referral,
    dikirim_pada: m.sentAt.toISOString(),
    dari_history: m.fromHistory,
  };
}

export type BatchResult = {
  inserted: number;
  duplicate: number;
  unknownNumbers: string[];
  edited: number;
  revoked: number;
  missing: number;
};

export const emptyBatchResult = (): BatchResult => ({
  inserted: 0,
  duplicate: 0,
  unknownNumbers: [],
  edited: 0,
  revoked: 0,
  missing: 0,
});

export function addBatchResult(total: BatchResult, r: BatchResult) {
  total.inserted += r.inserted;
  total.duplicate += r.duplicate;
  total.edited += r.edited;
  total.revoked += r.revoked;
  total.missing += r.missing;
  for (const n of r.unknownNumbers) if (!total.unknownNumbers.includes(n)) total.unknownNumbers.push(n);
}

// Gangguan jaringan sesaat (mis. "fetch failed" dari Vercel ke Supabase).
// Aman diulang karena ingest idempoten.
function isTransient(message: string) {
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network error|bad gateway|gateway timeout|service unavailable/i.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Satu panggilan ingest_messages untuk satu batch (pesan, edit, revoke).
export async function ingestBatch(admin: SupabaseClient, items: IngestItem[]): Promise<BatchResult> {
  if (!items.length) return emptyBatchResult();
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await admin.rpc("ingest_messages", { p_messages: items });
    if (!error) {
      const d = data as {
        inserted: number;
        duplicate: number;
        unknown_phone_number_ids: string[];
        edited: number;
        revoked: number;
        missing: number;
      };
      return {
        inserted: d.inserted,
        duplicate: d.duplicate,
        unknownNumbers: d.unknown_phone_number_ids ?? [],
        edited: d.edited,
        revoked: d.revoked,
        missing: d.missing,
      };
    }
    if (attempt >= 3 || !isTransient(error.message)) throw new Error(`ingest_messages: ${error.message}`);
    await sleep(500 * attempt);
  }
}

export async function ingestAll(
  admin: SupabaseClient,
  messages: NormalizedMessage[],
  updates: NormalizedUpdate[] = [],
  batchSize = INGEST_BATCH_SIZE,
): Promise<BatchResult> {
  // Pesan urut waktu (hasil tidak bergantung urutan payload, termasuk
  // atribusi first-touch lintas batch), lalu edit/revoke: batch sebelumnya
  // sudah ter-commit, dan di dalam satu batch fungsi SQL memproses pesan
  // sebelum edit/revoke.
  const sorted = [...messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const items = [...sorted.map(toIngestItem), ...updates.map(toIngestItem)];
  const total = emptyBatchResult();
  for (let i = 0; i < items.length; i += batchSize) {
    addBatchResult(total, await ingestBatch(admin, items.slice(i, i + batchSize)));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Status nomor dari event account_update
// ---------------------------------------------------------------------------

const DISCONNECT_EVENTS = new Set([
  "PARTNER_REMOVED",
  "ACCOUNT_DELETED",
  "ACCOUNT_OFFBOARDED",
  "PARTNER_APP_UNINSTALLED",
  "DISCONNECTED",
]);
const CONNECT_EVENTS = new Set(["PARTNER_ADDED", "PARTNER_APP_INSTALLED", "ACCOUNT_RECONNECTED"]);

export function numberStatusFromEvent(event: string): "aktif" | "terputus" | null {
  const e = event.toUpperCase();
  if (DISCONNECT_EVENTS.has(e)) return "terputus";
  if (CONNECT_EVENTS.has(e)) return "aktif";
  return null;
}

const onlyDigits = (v: string | null) => v?.replace(/\D/g, "") ?? "";

// Konteks event: sumber webhook (URL app Meta kita atau Dualhook) dan waktu
// diterima. Dipakai saat nomor pindah dari Dualhook ke jalur resmi.
export type AccountUpdateContext = { sumber?: string | null; receivedAt?: string | Date | null };

type NumberForUpdate = { id: string; nomor_tampil: string | null; sumber?: string | null; resmi_sejak?: string | null };

// Event dari Dualhook tidak pernah mengubah nomor yang sudah tersambung lewat
// jalur resmi (mis. PARTNER_REMOVED saat langganan Dualhook dibatalkan
// setelah nomor dipindah). Event pemutusan yang diterima sebelum nomor
// disambungkan ulang lewat jalur resmi juga milik koneksi lama.
export function accountUpdateApplies(
  n: Pick<NumberForUpdate, "sumber" | "resmi_sejak">,
  status: "aktif" | "terputus",
  ctx: AccountUpdateContext = {},
): boolean {
  if (n.sumber !== "resmi") return true;
  if (ctx.sumber === "dualhook") return false;
  if (status === "terputus" && n.resmi_sejak && ctx.receivedAt) {
    return new Date(ctx.receivedAt).getTime() >= new Date(n.resmi_sejak).getTime();
  }
  return true;
}

// Menandai wa_numbers sesuai event. Event tingkat WABA (PARTNER_REMOVED)
// mengenai semua nomor di WABA itu; event yang membawa phone_number hanya
// nomor tersebut. Mengembalikan jumlah nomor yang berubah.
export async function applyAccountUpdates(
  admin: SupabaseClient,
  updates: AccountUpdate[],
  ctx: AccountUpdateContext = {},
): Promise<number> {
  let changed = 0;
  for (const u of updates) {
    const status = numberStatusFromEvent(u.event);
    if (!status || (!u.wabaId && !u.phoneNumber)) continue;
    // select("*"): sumber/resmi_sejak baru ada setelah migrasi Tech Provider;
    // tanpa kolom itu semua nomor dianggap Dualhook (perilaku lama).
    let query = admin.from("wa_numbers").select("*");
    if (u.wabaId) query = query.eq("waba_id", u.wabaId);
    const { data, error } = await query;
    if (error) throw new Error(`wa_numbers: ${error.message}`);
    const ids = ((data ?? []) as NumberForUpdate[])
      .filter((n) => !u.phoneNumber || onlyDigits(n.nomor_tampil) === u.phoneNumber)
      .filter((n) => accountUpdateApplies(n, status, ctx))
      .map((n) => n.id);
    if (!ids.length) continue;
    const { error: updateError } = await admin
      .from("wa_numbers")
      .update({
        status,
        status_alasan: status === "terputus" ? u.event : null,
        status_berubah_pada: new Date().toISOString(),
      })
      .in("id", ids);
    if (updateError) throw new Error(`wa_numbers: ${updateError.message}`);
    changed += ids.length;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Event webhook
// ---------------------------------------------------------------------------

export type ProcessResult = BatchResult & {
  numbersChanged: number;
  // wa_message_id pesan bermedia di event ini, untuk diunduh setelahnya.
  mediaMessageIds: string[];
};

// Detail media untuk pesan yang sudah tersimpan tanpa media (riwayat chat:
// media_placeholder lalu detailnya menyusul). Kegagalan di sini tidak boleh
// menggagalkan ingest: pesan tetap tersimpan, medianya saja yang belum.
async function attachMedia(admin: SupabaseClient, messages: NormalizedMessage[]): Promise<string[]> {
  const withMedia = messages.filter((m) => m.media);
  if (!withMedia.length) return [];
  try {
    await attachMediaDetails(
      admin,
      withMedia.map((m) => ({
        wa_message_id: m.waMessageId,
        tipe: m.type,
        media_id: m.media!.id,
        media_mime: m.media!.mime,
        nama_file: m.media!.filename,
        isi: m.text,
      })),
    );
  } catch (err) {
    console.error("attach_media_details failed", err instanceof Error ? err.message : err);
  }
  return withMedia.map((m) => m.waMessageId);
}

export async function processWebhookEvent(admin: SupabaseClient, eventId: string): Promise<ProcessResult> {
  const { data: event, error } = await admin
    .from("webhook_events")
    .select("id, sumber, diterima_pada, payload_mentah, percobaan, signature_valid, diproses")
    .eq("id", eventId)
    .single();
  if (error || !event) throw new Error(`webhook_events ${eventId} tidak ditemukan`);

  const result: ProcessResult = { ...emptyBatchResult(), numbersChanged: 0, mediaMessageIds: [] };
  if (event.diproses || event.signature_valid === false) return result;

  try {
    const envelope = parseEnvelope(JSON.stringify(event.payload_mentah));
    if (!envelope) throw new Error("payload bukan envelope WhatsApp");

    const normalized = normalize(envelope);
    addBatchResult(result, await ingestAll(admin, normalized.messages, normalized.updates));
    result.numbersChanged = await applyAccountUpdates(admin, normalized.accountUpdates, {
      sumber: event.sumber,
      receivedAt: event.diterima_pada,
    });
    result.mediaMessageIds = await attachMedia(admin, normalized.messages);

    // Nomor yang belum didaftarkan: biarkan belum diproses supaya bisa diulang
    // setelah Super Admin menambahkan nomornya.
    const pending = result.unknownNumbers.length > 0;
    await admin
      .from("webhook_events")
      .update({
        diproses: !pending,
        diproses_pada: pending ? null : new Date().toISOString(),
        error: pending ? `nomor belum terdaftar: ${result.unknownNumbers.join(", ")}` : null,
        percobaan: event.percobaan + 1,
      })
      .eq("id", event.id);
  } catch (err) {
    await admin
      .from("webhook_events")
      .update({ error: err instanceof Error ? err.message : String(err), percobaan: event.percobaan + 1 })
      .eq("id", event.id);
    throw err;
  }

  return result;
}

export type PendingResult = BatchResult & {
  events: number;
  processed: number;
  failed: number;
  // true jika berhenti karena batas waktu dan masih ada event tersisa.
  timedOut: boolean;
};

// Memproses ulang event yang tertunda (mis. setelah nomor baru didaftarkan
// atau pemrosesan gagal), dari yang terlama. Berjalan per halaman sampai
// habis, `limit` event, atau `deadline` (epoch ms) terlewati, supaya pemanggil
// (server action, cron) tidak melewati maxDuration. Setiap event paling banyak
// diperiksa sekali per panggilan.
export async function processPendingEvents(
  admin: SupabaseClient,
  options: { limit?: number; deadline?: number; pageSize?: number } = {},
): Promise<PendingResult> {
  const { limit = 1000, deadline = Number.POSITIVE_INFINITY, pageSize = 100 } = options;
  const totals: PendingResult = { ...emptyBatchResult(), events: 0, processed: 0, failed: 0, timedOut: false };
  let cursor: string | null = null;

  while (totals.events < limit) {
    let query = admin
      .from("webhook_events")
      .select("id, diterima_pada")
      .eq("diproses", false)
      .or("signature_valid.is.null,signature_valid.eq.true")
      .lt("percobaan", MAX_ATTEMPTS * 4)
      .order("diterima_pada")
      .order("id")
      .limit(Math.min(pageSize, limit - totals.events));
    if (cursor) query = query.gt("diterima_pada", cursor);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const { id, diterima_pada } of data) {
      if (Date.now() > deadline) {
        totals.timedOut = true;
        return totals;
      }
      cursor = diterima_pada;
      totals.events++;
      try {
        const r = await processWebhookEvent(admin, id);
        addBatchResult(totals, r);
        if (!r.unknownNumbers.length) totals.processed++;
      } catch {
        // Error sudah dicatat di baris webhook_events; lanjut ke event berikutnya.
        totals.failed++;
      }
    }
    if (data.length < pageSize) break;
  }
  return totals;
}
