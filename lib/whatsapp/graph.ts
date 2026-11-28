// Panggilan Graph API untuk jalur resmi Tech Provider (Embedded Signup +
// Coexistence). fetch bisa diganti untuk test. Token dan app secret tidak
// pernah ikut ke pesan error.

export type GraphOptions = {
  graphVersion: string;
  fetch?: typeof fetch;
};

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null = null,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

const BASE = "https://graph.facebook.com";

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; token?: string; query?: Record<string, string>; body?: unknown },
  opts: GraphOptions,
): Promise<T> {
  const url = new URL(`${BASE}/${opts.graphVersion}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  const res = await (opts.fetch ?? fetch)(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string; code?: number } })
    | null;
  if (!res.ok || !data || data.error) {
    const err = data?.error;
    throw new GraphError(`Graph API ${path.split("?")[0]}: ${err?.message ?? `HTTP ${res.status}`}`, res.status, err?.code ?? null);
  }
  return data;
}

export type BusinessToken = { accessToken: string; expiresAt: Date | null };

// Tukar code dari FB.login (berlaku ±30 detik) dengan business token.
// App secret hanya dipakai di server.
export async function exchangeCode(
  code: string,
  app: { appId: string; appSecret: string },
  opts: GraphOptions,
  now: number = Date.now(),
): Promise<BusinessToken> {
  const data = await call<{ access_token?: string; expires_in?: number }>(
    "oauth/access_token",
    { query: { client_id: app.appId, client_secret: app.appSecret, code } },
    opts,
  );
  if (!data.access_token) throw new GraphError("Graph API oauth/access_token: token kosong", 200);
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(now + data.expires_in * 1000) : null,
  };
}

export type WabaPhoneNumber = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  isOnBizApp: boolean | null;
  platformType: string | null;
};

// Nomor di WABA klien. Event Coexistence (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING)
// hanya membawa waba_id, jadi nomornya dibaca dari sini.
export async function listPhoneNumbers(wabaId: string, token: string, opts: GraphOptions): Promise<WabaPhoneNumber[]> {
  const data = await call<{
    data?: {
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      is_on_biz_app?: boolean;
      platform_type?: string;
    }[];
  }>(
    `${wabaId}/phone_numbers`,
    { token, query: { fields: "id,display_phone_number,verified_name,is_on_biz_app,platform_type" } },
    opts,
  );
  return (data.data ?? []).map((n) => ({
    id: n.id,
    displayPhoneNumber: n.display_phone_number ?? null,
    verifiedName: n.verified_name ?? null,
    isOnBizApp: n.is_on_biz_app ?? null,
    platformType: n.platform_type ?? null,
  }));
}

// Berlangganan webhook WABA klien untuk app kita.
export async function subscribeApp(wabaId: string, token: string, opts: GraphOptions): Promise<void> {
  const data = await call<{ success?: boolean }>(`${wabaId}/subscribed_apps`, { method: "POST", token }, opts);
  if (!data.success) throw new GraphError(`Graph API ${wabaId}/subscribed_apps: tidak berhasil`, 200);
}

export type SmbSyncType = "smb_app_state_sync" | "history";

// Minta Meta mengirim kontak (smb_app_state_sync) atau riwayat chat (history)
// dari aplikasi WhatsApp Business lewat webhook. Hanya boleh sekali per jenis,
// dalam 24 jam setelah onboarding.
export async function requestSmbAppData(
  phoneNumberId: string,
  syncType: SmbSyncType,
  token: string,
  opts: GraphOptions,
): Promise<string | null> {
  const data = await call<{ request_id?: string }>(
    `${phoneNumberId}/smb_app_data`,
    { method: "POST", token, body: { messaging_product: "whatsapp", sync_type: syncType } },
    opts,
  );
  return data.request_id ?? null;
}
