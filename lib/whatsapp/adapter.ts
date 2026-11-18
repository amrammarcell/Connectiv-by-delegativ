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

export type NormalizeResult = {
  messages: NormalizedMessage[];
  // Bagian yang sengaja tidak diproses (status, edit, revoke, field lain).
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
};

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;
const SKIPPED_TYPES = new Set(["edit", "revoke", "system", "unsupported", "ephemeral"]);

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

export function normalize(envelope: WebhookEnvelope): NormalizeResult {
  const messages: NormalizedMessage[] = [];
  const ignored: string[] = [];

  for (const entry of envelope.entry) {
    for (const change of entry.changes) {
      const value = (change.value ?? {}) as ChangeValue;
      const phoneNumberId = value.metadata?.phone_number_id;
      const businessPhone = digits(value.metadata?.display_phone_number);

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

  return { messages, ignored };
}
