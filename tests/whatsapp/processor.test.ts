import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedMessage, NormalizedUpdate } from "@/lib/whatsapp/adapter";
import { ingestAll, numberStatusFromEvent } from "@/lib/whatsapp/processor";

// Unit test processor tanpa database: pembagian batch, urutan, dan retry.

const msg = (i: number, minutes: number): NormalizedMessage => ({
  phoneNumberId: "1",
  waMessageId: `wamid.${i}`,
  direction: "masuk",
  customerPhone: "6281200000001",
  customerName: null,
  type: "text",
  text: `pesan ${i}`,
  media: null,
  referral: null,
  sentAt: new Date(Date.UTC(2026, 10, 1, 0, minutes)),
  fromHistory: true,
});

const ok = (n: number) => ({
  data: { inserted: n, duplicate: 0, unknown_phone_number_ids: [], edited: 0, revoked: 0, missing: 0 },
  error: null,
});

function fakeAdmin(rpc: (name: string, args: { p_messages: Record<string, unknown>[] }) => unknown) {
  return { rpc: vi.fn(rpc) } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

describe("ingestAll", () => {
  it("membagi menjadi batch, pesan urut waktu, edit/revoke di akhir", async () => {
    const batches: Record<string, unknown>[][] = [];
    const admin = fakeAdmin((_name, args) => {
      batches.push(args.p_messages);
      return ok(args.p_messages.filter((m) => m.kind === "message").length);
    });
    const messages = [msg(1, 30), msg(2, 10), msg(3, 20), msg(4, 5), msg(5, 1)];
    const updates: NormalizedUpdate[] = [
      { kind: "revoke", phoneNumberId: "1", originalWaMessageId: "wamid.2", text: null, at: new Date() },
    ];

    const result = await ingestAll(admin, messages, updates, 2);

    expect(admin.rpc).toHaveBeenCalledTimes(3);
    expect(admin.rpc.mock.calls[0]![0]).toBe("ingest_messages");
    expect(batches.flat().map((m) => m.wa_message_id ?? m.original_wa_message_id)).toEqual([
      "wamid.5",
      "wamid.4",
      "wamid.2",
      "wamid.3",
      "wamid.1",
      "wamid.2",
    ]);
    expect(batches.at(-1)!.at(-1)).toMatchObject({ kind: "revoke", original_wa_message_id: "wamid.2" });
    expect(result.inserted).toBe(5);
  });

  it("mengulang gangguan jaringan sesaat (fetch failed), tidak mengulang error lain", async () => {
    let calls = 0;
    const flaky = fakeAdmin(() => (++calls === 1 ? { data: null, error: { message: "TypeError: fetch failed" } } : ok(1)));
    expect((await ingestAll(flaky, [msg(1, 0)])).inserted).toBe(1);
    expect(calls).toBe(2);

    const broken = fakeAdmin(() => ({ data: null, error: { message: "invalid input syntax" } }));
    await expect(ingestAll(broken, [msg(1, 0)])).rejects.toThrow("ingest_messages: invalid input syntax");
    expect(broken.rpc).toHaveBeenCalledTimes(1);
  });

  it("tanpa pesan tidak memanggil database", async () => {
    const admin = fakeAdmin(() => ok(0));
    await ingestAll(admin, []);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe("numberStatusFromEvent", () => {
  it("event pemutusan menandai terputus, penyambungan menandai aktif, lainnya diabaikan", () => {
    expect(numberStatusFromEvent("PARTNER_REMOVED")).toBe("terputus");
    expect(numberStatusFromEvent("ACCOUNT_DELETED")).toBe("terputus");
    expect(numberStatusFromEvent("PARTNER_ADDED")).toBe("aktif");
    expect(numberStatusFromEvent("WEBHOOK_CONFIG_UPDATED")).toBeNull();
    expect(numberStatusFromEvent("VERIFIED_ACCOUNT")).toBeNull();
  });
});
