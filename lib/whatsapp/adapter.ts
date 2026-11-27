import type { WebhookEnvelope } from "./webhook";

// Adapter: payload webhook Meta (Cloud API / Coexistence) → format internal.
// Semua sumber (app sendiri, Dualhook, Tech Provider) memakai format Meta,
// jadi hanya adapter ini yang perlu diubah jika sumbernya berubah.

export type NormalizedMessage = {
  phoneNumberId: string;
  waMessageId: string;
  direction: "masuk" | "keluar";
  customerPhone: string;
  customerName: string | null;
  type: string;
  text: string | null;
  media: { id: string; mime: string | null; filename: string | null } | null;
  referral: { source_id: string; headline?: string; source_url?: string; ctwa_clid?: string } | null;
  sentAt: Date;
  fromHistory: boolean;
};

// Edit atau tarik ("hapus untuk semua") atas pesan yang sudah ada.
export type NormalizedUpdate = {
  kind: "edit" | "revoke";
  phoneNumberId: string;
  originalWaMessageId: string;
  // Isi baru untuk edit; null untuk revoke.
  text: string | null;
  at: Date;
};

// Event account_update (mis. PARTNER_REMOVED saat nomor diputus dari app).
export type AccountUpdate = {
  event: string;
  wabaId: string | null;
  phoneNumber: string | null;
};

export type NormalizeResult = {
  messages: NormalizedMessage[];
  updates: NormalizedUpdate[];
  accountUpdates: AccountUpdate[];
  // Bagian yang sengaja tidak diproses (status, field lain).
  ignored: string[];
};

type RawMessage = {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: RawMedia;
  video?: RawMedia;
  audio?: RawMedia;
  document?: RawMedia;
  sticker?: RawMedia;
  location?: { name?: string; address?: string };
  reaction?: { emoji?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  referral?: { source_id?: string; headline?: string; source_url?: string; ctwa_clid?: string };
  edit?: { original_message_id?: string; message?: RawMessage };
  revoke?: { original_message_id?: string };
};

type RawMedia = { id?: string; mime_type?: string; filename?: string; caption?: string };

type ChangeValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: RawMessage[];
  message_echoes?: RawMessage[];
  statuses?: unknown[];
  history?: {
    errors?: { code?: number; title?: string }[];
    threads?: { id?: string; messages?: RawMessage[] }[];
  }[];
  // account_update
  event?: string;
  phone_number?: string;
  waba_info?: { waba_id?: string };
};

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;
const SKIPPED_TYPES = new Set(["system", "unsupported", "ephemeral"]);

function digits(value: string | undefined): string | null {
  const d = value?.replace(/\D/g, "") ?? "";
  return d.length >= 6 ? d : null;
}

function extractText(m: RawMessage): string | null {
  const media = MEDIA_TYPES.map((t) => m[t]).find(Boolean);
  const value =
    m.text?.body ??
    media?.caption ??
    m.reaction?.emoji ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    (m.location ? [m.location.name, m.location.address].filter(Boolean).join(", ") || null : null);
  return value?.trim() ? value : null;
}

function extractMedia(m: RawMessage): NormalizedMessage["media"] {
  for (const t of MEDIA_TYPES) {
    const media = m[t];
    if (media?.id) return { id: media.id, mime: media.mime_type ?? null, filename: media.filename ?? null };
  }
  return null;
}

function build(
  m: RawMessage,
  ctx: {
    phoneNumberId: string;
    direction: "masuk" | "keluar";
    customerPhone: string | null;
    names: Map<string, string>;
    fromHistory: boolean;
  },
): NormalizedMessage | null {
  const seconds = Number(m.timestamp);
  if (!m.id || !m.type || !ctx.customerPhone || !Number.isFinite(seconds)) return null;
  const referral = ctx.direction === "masuk" && m.referral?.source_id ? { ...m.referral, source_id: m.referral.source_id } : null;
  return {
    phoneNumberId: ctx.phoneNumberId,
    waMessageId: m.id,
    direction: ctx.direction,
    customerPhone: ctx.customerPhone,
    customerName: ctx.names.get(ctx.customerPhone) ?? null,
    type: m.type,
    text: extractText(m),
    media: extractMedia(m),
    referral,
    sentAt: new Date(seconds * 1000),
    fromHistory: ctx.fromHistory,
  };
}

function buildUpdate(m: RawMessage, phoneNumberId: string): NormalizedUpdate | null {
  const seconds = Number(m.timestamp);
  const at = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
  if (m.type === "edit") {
    const original = m.edit?.original_message_id;
    const text = m.edit?.message ? extractText(m.edit.message) : null;
    if (!original || text === null) return null;
    return { kind: "edit", phoneNumberId, originalWaMessageId: original, text, at };
  }
  const original = m.revoke?.original_message_id;
  if (!original) return null;
  return { kind: "revoke", phoneNumberId, originalWaMessageId: original, text: null, at };
}

export function normalize(envelope: WebhookEnvelope): NormalizeResult {
  const messages: NormalizedMessage[] = [];
  const updates: NormalizedUpdate[] = [];
  const accountUpdates: AccountUpdate[] = [];
  const ignored: string[] = [];

  for (const entry of envelope.entry) {
    for (const change of entry.changes) {
      const value = (change.value ?? {}) as ChangeValue;
      const phoneNumberId = value.metadata?.phone_number_id;
      const businessPhone = digits(value.metadata?.display_phone_number);

      if (change.field === "account_update") {
        if (value.event) {
          accountUpdates.push({
            event: value.event,
            // entry.id adalah WABA ID; "0" dipakai payload contoh dari dashboard Meta.
            wabaId: value.waba_info?.waba_id ?? (entry.id && entry.id !== "0" ? entry.id : null),
            phoneNumber: digits(value.phone_number),
          });
        } else ignored.push("account_update:tanpa-event");
        continue;
      }
      if (!["messages", "smb_message_echoes", "history"].includes(change.field)) {
        ignored.push(change.field);
        continue;
      }
      if (!phoneNumberId) {
        ignored.push(`${change.field}:tanpa-phone_number_id`);
        continue;
      }

      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        const phone = digits(c.wa_id);
        if (phone && c.profile?.name) names.set(phone, c.profile.name);
      }

      const push = (m: RawMessage, ctx: Omit<Parameters<typeof build>[1], "phoneNumberId" | "names">) => {
        if (m.type && SKIPPED_TYPES.has(m.type)) {
          ignored.push(`${change.field}:${m.type}`);
          return;
        }
        if (m.type === "edit" || m.type === "revoke") {
          const update = buildUpdate(m, phoneNumberId);
          if (update) updates.push(update);
          else ignored.push(`${change.field}:${m.type}-tidak-lengkap`);
          return;
        }
        const normalized = build(m, { ...ctx, phoneNumberId, names });
        if (normalized) messages.push(normalized);
        else ignored.push(`${change.field}:tidak-lengkap`);
      };

      if (value.statuses?.length) ignored.push("statuses");

      if (change.field === "messages") {
        for (const m of value.messages ?? []) {
          push(m, { direction: "masuk", customerPhone: digits(m.from), fromHistory: false });
        }
      } else if (change.field === "smb_message_echoes") {
        for (const m of value.message_echoes ?? []) {
          push(m, { direction: "keluar", customerPhone: digits(m.to), fromHistory: false });
        }
      } else {
        for (const chunk of value.history ?? []) {
          if (chunk.errors?.length) ignored.push(`history:error-${chunk.errors[0]?.code ?? "?"}`);
          for (const thread of chunk.threads ?? []) {
            const customerPhone = digits(thread.id);
            for (const m of thread.messages ?? []) {
              const fromBusiness = businessPhone !== null && digits(m.from) === businessPhone;
              push(m, { direction: fromBusiness ? "keluar" : "masuk", customerPhone, fromHistory: true });
            }
          }
        }
      }
    }
  }

  return { messages, updates, accountUpdates, ignored };
}
