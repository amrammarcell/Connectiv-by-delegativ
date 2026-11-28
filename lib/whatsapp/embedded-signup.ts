// Fungsi murni untuk event postMessage Embedded Signup (dipakai di browser,
// tanpa impor server). Meta mengirim JSON string dari *.facebook.com:
// { type: "WA_EMBEDDED_SIGNUP", event, data, version }.

// Versi sessionInfo yang diminta di extras FB.login.
export const SESSION_INFO_VERSION = "3";
export const COEXISTENCE_FEATURE_TYPE = "whatsapp_business_app_onboarding";

export type EmbeddedSignupEvent =
  | { kind: "finish"; wabaId: string; phoneNumberId: string | null; coexistence: boolean }
  | { kind: "cancel"; step: string | null }
  | { kind: "error"; message: string; errorId: string | null };

export function isFacebookOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return new URL(origin).protocol === "https:" && (host === "facebook.com" || host.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

// null = bukan event Embedded Signup (abaikan).
export function parseEmbeddedSignupMessage(origin: string, raw: unknown): EmbeddedSignupEvent | null {
  if (!isFacebookOrigin(origin)) return null;
  let msg: unknown = raw;
  if (typeof raw === "string") {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof msg !== "object" || msg === null) return null;
  const { type, event, data } = msg as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (type !== "WA_EMBEDDED_SIGNUP" || typeof event !== "string") return null;
  const d = data ?? {};

  if (event === "FINISH" || event === "FINISH_ONLY_WABA" || event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
    const wabaId = str(d.waba_id);
    if (!wabaId) return { kind: "error", message: "Meta tidak mengirim WABA ID.", errorId: null };
    return {
      kind: "finish",
      wabaId,
      phoneNumberId: str(d.phone_number_id),
      coexistence: event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    };
  }
  if (event === "CANCEL") {
    // Pembatalan karena error juga datang sebagai CANCEL dengan error_message.
    const message = str(d.error_message);
    if (message) return { kind: "error", message, errorId: str(d.error_id) };
    return { kind: "cancel", step: str(d.current_step) };
  }
  if (event === "ERROR") {
    return { kind: "error", message: str(d.error_message) ?? "Terjadi kesalahan di Meta.", errorId: str(d.error_id) };
  }
  return null;
}
