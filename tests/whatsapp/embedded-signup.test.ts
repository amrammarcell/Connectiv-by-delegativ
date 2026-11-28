import { describe, expect, it } from "vitest";
import { isFacebookOrigin, parseEmbeddedSignupMessage } from "@/lib/whatsapp/embedded-signup";
import { syncSummary } from "@/lib/whatsapp/number-status";

const FB = "https://www.facebook.com";
const msg = (event: string, data: Record<string, unknown>) =>
  JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event, data, version: "3" });

describe("parseEmbeddedSignupMessage", () => {
  it("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING (Coexistence) hanya membawa waba_id", () => {
    expect(parseEmbeddedSignupMessage(FB, msg("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", { waba_id: "111", business_id: "9" }))).toEqual({
      kind: "finish",
      wabaId: "111",
      phoneNumberId: null,
      coexistence: true,
    });
  });

  it("FINISH biasa membawa phone_number_id", () => {
    expect(parseEmbeddedSignupMessage(FB, msg("FINISH", { waba_id: "111", phone_number_id: "222" }))).toMatchObject({
      kind: "finish",
      phoneNumberId: "222",
      coexistence: false,
    });
  });

  it("CANCEL dan ERROR", () => {
    expect(parseEmbeddedSignupMessage(FB, msg("CANCEL", { current_step: "PHONE_NUMBER_SETUP" }))).toEqual({
      kind: "cancel",
      step: "PHONE_NUMBER_SETUP",
    });
    expect(parseEmbeddedSignupMessage(FB, msg("CANCEL", { error_message: "Nomor tidak memenuhi syarat", error_id: "5" }))).toEqual({
      kind: "error",
      message: "Nomor tidak memenuhi syarat",
      errorId: "5",
    });
    expect(parseEmbeddedSignupMessage(FB, msg("ERROR", {}))).toMatchObject({ kind: "error" });
    expect(parseEmbeddedSignupMessage(FB, msg("FINISH", {}))).toMatchObject({ kind: "error" });
  });

  it("mengabaikan origin selain facebook.com dan pesan lain", () => {
    expect(parseEmbeddedSignupMessage("https://evil.example", msg("FINISH", { waba_id: "1" }))).toBeNull();
    expect(parseEmbeddedSignupMessage("https://facebook.com.evil.example", msg("FINISH", { waba_id: "1" }))).toBeNull();
    expect(parseEmbeddedSignupMessage(FB, "bukan json")).toBeNull();
    expect(parseEmbeddedSignupMessage(FB, JSON.stringify({ type: "LAIN" }))).toBeNull();
    expect(isFacebookOrigin("http://www.facebook.com")).toBe(false);
    expect(isFacebookOrigin("https://web.facebook.com")).toBe(true);
  });
});

describe("syncSummary", () => {
  const now = Date.UTC(2026, 10, 28, 12);
  const base = {
    sumber: "resmi",
    sync_kontak_status: "belum",
    sync_riwayat_status: "belum",
    sync_batas: new Date(now + 3_600_000).toISOString(),
    sync_error: null,
  };

  it("nomor Dualhook tidak punya status sinkronisasi", () => {
    expect(syncSummary({ ...base, sumber: "dualhook", sync_kontak_status: null, sync_riwayat_status: null }, now).level).toBe("netral");
  });

  it("proses, gagal (bisa dicoba lagi), selesai, kedaluwarsa", () => {
    expect(syncSummary(base, now)).toMatchObject({ level: "proses", canRetry: true });
    expect(syncSummary({ ...base, sync_kontak_status: "diminta", sync_riwayat_status: "memproses" }, now)).toMatchObject({
      level: "proses",
      canRetry: false,
    });
    expect(syncSummary({ ...base, sync_kontak_status: "gagal", sync_error: "x" }, now)).toMatchObject({
      level: "gagal",
      text: "Kontak gagal disinkronkan: x",
      canRetry: true,
    });
    expect(syncSummary({ ...base, sync_kontak_status: "diminta", sync_riwayat_status: "diminta" }, now).level).toBe("ok");
    expect(syncSummary({ ...base, sync_batas: new Date(now - 1).toISOString() }, now)).toMatchObject({
      level: "gagal",
      canRetry: false,
    });
  });
});
