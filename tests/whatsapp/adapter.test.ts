import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/whatsapp/adapter";
import { parseEnvelope } from "@/lib/whatsapp/webhook";

function fixture(name: string) {
  const envelope = parseEnvelope(readFileSync(`tests/fixtures/webhooks/${name}.json`, "utf8"));
  if (!envelope) throw new Error(`fixture ${name} bukan envelope WhatsApp`);
  return normalize(envelope);
}

describe("normalize", () => {
  it("pesan teks asli dari nomor tes Meta", () => {
    const { messages } = fixture("meta-test-number-inbound-text");
    expect(messages).toEqual([
      {
        phoneNumberId: "1502132426306454",
        waMessageId: "wamid.UJI-INBOUND-TEXT",
        direction: "masuk",
        customerPhone: "6281200000001",
        customerName: "Pelanggan Uji",
        type: "text",
        text: "Test connectiv 1",
        media: null,
        referral: null,
        sentAt: new Date(1794979022 * 1000),
        fromHistory: false,
      },
    ]);
  });

  it("gambar membawa media id dan mime", () => {
    const [m] = fixture("meta-test-number-inbound-image").messages;
    expect(m.type).toBe("image");
    expect(m.text).toBeNull();
    expect(m.media).toEqual({ id: "29276244795393226", mime: "image/jpeg", filename: null });
  });

  it("balasan CS dari HP (smb_message_echoes) menjadi pesan keluar ke pelanggan", () => {
    const [m] = fixture("coexistence-smb-message-echoes").messages;
    expect(m.direction).toBe("keluar");
    expect(m.customerPhone).toBe("6281200000001");
    expect(m.text).toBe("Halo kak, ada yang bisa dibantu?");
  });

  it("riwayat chat: arah ditentukan dari nomor bisnis, error sync dicatat", () => {
    const { messages, ignored } = fixture("coexistence-history");
    expect(messages.map((m) => [m.waMessageId, m.direction, m.customerPhone, m.fromHistory])).toEqual([
      ["wamid.UJI-HISTORY-IN", "masuk", "6281200000002", true],
      ["wamid.UJI-HISTORY-OUT", "keluar", "6281200000002", true],
    ]);
    expect(ignored).toContain("history:error-2593109");
  });

  it("chat dari iklan CTWA membawa referral", () => {
    const [m] = fixture("ctwa-referral-inbound").messages;
    expect(m.referral).toMatchObject({
      source_id: "120200000000000001",
      headline: "Promo Bundling 3 Pcs",
      ctwa_clid: "ARAkUJI_CTWA_CLID",
    });
    expect(m.customerName).toBe("Calon Pembeli");
  });

  it("webhook tes dashboard dan account_update tidak menghasilkan pesan yang salah", () => {
    expect(fixture("meta-dashboard-test-account-update")).toEqual({
      messages: [],
      updates: [],
      // Payload contoh dashboard memakai entry.id "0": tidak ada WABA yang bisa dicocokkan.
      accountUpdates: [{ event: "VERIFIED_ACCOUNT", wabaId: null, phoneNumber: "16505551111" }],
      ignored: [],
    });
    const sample = fixture("meta-dashboard-test-messages").messages;
    expect(sample).toHaveLength(1);
    expect(sample[0].phoneNumberId).toBe("123456123");
  });

  it("account_update PARTNER_REMOVED membawa WABA ID", () => {
    expect(fixture("account-update-partner-removed").accountUpdates).toEqual([
      { event: "PARTNER_REMOVED", wabaId: "100000000000001", phoneNumber: null },
    ]);
  });

  it("edit dan revoke (pelanggan dan echo CS) menjadi pembaruan pesan asli, bukan pesan baru", () => {
    const { messages, updates, ignored } = fixture("coexistence-edit-revoke");
    expect(messages).toEqual([]);
    expect(ignored).toEqual([]);
    expect(updates).toEqual([
      {
        kind: "edit",
        phoneNumberId: "200000000000001",
        originalWaMessageId: "wamid.UJI-ASLI-1",
        text: "Kak, ukuran XL ready?",
        at: new Date(1794980000 * 1000),
      },
      {
        kind: "revoke",
        phoneNumberId: "200000000000001",
        originalWaMessageId: "wamid.UJI-ASLI-2",
        text: null,
        at: new Date(1794980060 * 1000),
      },
      {
        kind: "edit",
        phoneNumberId: "200000000000001",
        originalWaMessageId: "wamid.UJI-ASLI-3",
        text: "Ready kak, XL tinggal 2",
        at: new Date(1794980120 * 1000),
      },
    ]);
  });

  it("status diabaikan; edit/revoke tanpa pesan asli dicatat tidak lengkap", () => {
    const envelope = parseEnvelope(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "1",
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: "1", display_phone_number: "15550000000" },
                  statuses: [{ id: "wamid.X", status: "read" }],
                  messages: [
                    { id: "wamid.E", from: "6281200000001", timestamp: "1", type: "edit" },
                    { id: "wamid.R", from: "6281200000001", timestamp: "1", type: "revoke" },
                  ],
                },
              },
            ],
          },
        ],
      }),
    )!;
    const { messages, updates, ignored } = normalize(envelope);
    expect(messages).toEqual([]);
    expect(updates).toEqual([]);
    expect(ignored).toEqual(
      expect.arrayContaining(["statuses", "messages:edit-tidak-lengkap", "messages:revoke-tidak-lengkap"]),
    );
  });
});
