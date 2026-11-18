import type { SupabaseClient } from "@supabase/supabase-js";
import { normalize, type NormalizedMessage } from "./adapter";
import { parseEnvelope } from "./webhook";

// Processor: webhook_events (mentah) → kontak + pesan lewat fungsi SQL
// ingest_message. Butuh client dengan secret key (melewati RLS).

export const MAX_ATTEMPTS = 5;

export type IngestOutcome = "inserted" | "duplicate" | "unknown_number";

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

export type ProcessResult = {
  inserted: number;
  duplicate: number;
  unknownNumbers: string[];
};

export async function processWebhookEvent(admin: SupabaseClient, eventId: string): Promise<ProcessResult> {
  const { data: event, error } = await admin
    .from("webhook_events")
    .select("id, payload_mentah, percobaan, signature_valid, diproses")
    .eq("id", eventId)
    .single();
  if (error || !event) throw new Error(`webhook_events ${eventId} tidak ditemukan`);

  const result: ProcessResult = { inserted: 0, duplicate: 0, unknownNumbers: [] };
  if (event.diproses || event.signature_valid === false) return result;

  try {
    const envelope = parseEnvelope(JSON.stringify(event.payload_mentah));
    if (!envelope) throw new Error("payload bukan envelope WhatsApp");

    for (const m of normalize(envelope).messages) {
      const outcome = await ingestMessage(admin, m);
      if (outcome === "inserted") result.inserted++;
      else if (outcome === "duplicate") result.duplicate++;
      else if (!result.unknownNumbers.includes(m.phoneNumberId)) result.unknownNumbers.push(m.phoneNumberId);
    }

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

// Memproses ulang event yang tertunda (mis. setelah nomor baru didaftarkan).
export async function processPendingEvents(admin: SupabaseClient, limit = 200) {
  const { data, error } = await admin
    .from("webhook_events")
    .select("id")
    .eq("diproses", false)
    .or("signature_valid.is.null,signature_valid.eq.true")
    .lt("percobaan", MAX_ATTEMPTS * 4)
    .order("diterima_pada")
    .limit(limit);
  if (error) throw new Error(error.message);

  const totals: ProcessResult = { inserted: 0, duplicate: 0, unknownNumbers: [] };
  for (const { id } of data ?? []) {
    try {
      const r = await processWebhookEvent(admin, id);
      totals.inserted += r.inserted;
      totals.duplicate += r.duplicate;
      for (const n of r.unknownNumbers) if (!totals.unknownNumbers.includes(n)) totals.unknownNumbers.push(n);
    } catch {
      // Error sudah dicatat di baris webhook_events; lanjut ke event berikutnya.
    }
  }
  return { events: data?.length ?? 0, ...totals };
}
