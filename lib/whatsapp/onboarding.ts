import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  exchangeCode,
  listPhoneNumbers,
  requestSmbAppData,
  subscribeApp,
  type GraphOptions,
  type SmbSyncType,
} from "./graph";

// Onboarding nomor lewat jalur resmi (Embedded Signup + Coexistence):
// code → business token (terenkripsi) → subscribed_apps → wa_numbers →
// sinkronisasi kontak lalu riwayat (masing-masing sekali, dalam 24 jam).
// Penyimpanan lewat OnboardingStore supaya alur bisa dites tanpa database.

export const SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SyncStatus = "belum" | "memproses" | "diminta" | "gagal";
export type SyncKind = "kontak" | "riwayat";

export type SyncCandidate = {
  id: string;
  phone_number_id: string;
  waba_id: string;
  sync_kontak_status: SyncStatus | null;
  sync_riwayat_status: SyncStatus | null;
  sync_batas: string | null;
};

export type NumberRow = {
  workspace_id: string;
  phone_number_id: string;
  waba_id: string;
  label: string;
  nomor_tampil: string | null;
};

export interface OnboardingStore {
  tokenWorkspace(wabaId: string): Promise<string | null>;
  saveToken(row: { workspaceId: string; wabaId: string; encrypted: string; expiresAt: Date | null; userId: string }): Promise<void>;
  getEncryptedToken(wabaId: string): Promise<string | null>;
  findNumber(phoneNumberId: string): Promise<{ id: string; workspace_id: string } | null>;
  insertResmiNumber(row: NumberRow, now: Date): Promise<string>;
  reconnectResmiNumber(id: string, row: NumberRow, now: Date): Promise<void>;
  syncCandidates(ids: string[] | null): Promise<SyncCandidate[]>;
  // Ubah status hanya jika masih bisa dicoba (belum/gagal) → true jika berhasil
  // diklaim. Mencegah dua proses memanggil smb_app_data untuk nomor yang sama.
  claimSync(id: string, kind: SyncKind): Promise<boolean>;
  finishSync(id: string, kind: SyncKind, status: "diminta" | "gagal", error: string | null, now: Date): Promise<void>;
}

export type TechProviderConfig = {
  appId: string;
  appSecret: string;
  encryptionKey: string;
  graph: GraphOptions;
};

export class OnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingError";
  }
}

export type OnboardInput = {
  workspaceId: string;
  userId: string;
  code: string;
  wabaId: string;
  phoneNumberId: string | null;
};

export type OnboardResult = {
  numbers: { id: string; label: string; phoneNumberId: string; baru: boolean }[];
};

export async function onboardWaba(
  store: OnboardingStore,
  input: OnboardInput,
  config: TechProviderConfig,
  now: Date = new Date(),
): Promise<OnboardResult> {
  // 1. Tukar code dulu: berlaku ±30 detik.
  const token = await exchangeCode(input.code, { appId: config.appId, appSecret: config.appSecret }, config.graph, now.getTime());

  // 2. WABA yang sudah tersambung ke workspace lain tidak boleh diambil alih.
  const owner = await store.tokenWorkspace(input.wabaId);
  if (owner && owner !== input.workspaceId) {
    throw new OnboardingError("Akun WhatsApp Business ini sudah tersambung ke workspace lain.");
  }

  // 3. Nomor di WABA (juga membuktikan token punya akses ke WABA itu).
  const all = await listPhoneNumbers(input.wabaId, token.accessToken, config.graph);
  const phones = input.phoneNumberId ? all.filter((p) => p.id === input.phoneNumberId) : all;
  if (!phones.length) throw new OnboardingError("Tidak ada nomor WhatsApp di akun yang baru disambungkan.");

  const existing = await Promise.all(phones.map((p) => store.findNumber(p.id)));
  if (existing.some((e) => e && e.workspace_id !== input.workspaceId)) {
    throw new OnboardingError("Nomor ini sudah terdaftar di workspace lain. Hubungi Delegativ.");
  }

  // 4. Berlangganan webhook WABA, lalu simpan token terenkripsi.
  await subscribeApp(input.wabaId, token.accessToken, config.graph);
  await store.saveToken({
    workspaceId: input.workspaceId,
    wabaId: input.wabaId,
    encrypted: encryptSecret(token.accessToken, config.encryptionKey),
    expiresAt: token.expiresAt,
    userId: input.userId,
  });

  // 5. wa_numbers: baru, atau nomor lama (mis. pindahan dari Dualhook) yang
  //    disambungkan ulang lewat jalur resmi.
  const numbers: OnboardResult["numbers"] = [];
  for (const [i, p] of phones.entries()) {
    const row: NumberRow = {
      workspace_id: input.workspaceId,
      phone_number_id: p.id,
      waba_id: input.wabaId,
      label: (p.verifiedName ?? p.displayPhoneNumber ?? `Nomor ${p.id}`).slice(0, 60),
      nomor_tampil: p.displayPhoneNumber,
    };
    const found = existing[i];
    if (found) {
      await store.reconnectResmiNumber(found.id, row, now);
      numbers.push({ id: found.id, label: row.label, phoneNumberId: p.id, baru: false });
    } else {
      const id = await store.insertResmiNumber(row, now);
      numbers.push({ id, label: row.label, phoneNumberId: p.id, baru: true });
    }
  }
  return { numbers };
}

const SYNC_ORDER: { kind: SyncKind; type: SmbSyncType }[] = [
  { kind: "kontak", type: "smb_app_state_sync" },
  { kind: "riwayat", type: "history" },
];

export type SyncOutcome = { id: string; kind: SyncKind; status: "diminta" | "gagal" | "kedaluwarsa"; error?: string };

const statusOf = (n: SyncCandidate, kind: SyncKind) => (kind === "kontak" ? n.sync_kontak_status : n.sync_riwayat_status);
const retryable = (s: SyncStatus | null) => s === "belum" || s === "gagal";

// Minta sinkronisasi kontak lalu riwayat untuk nomor resmi yang belum
// selesai dan masih dalam 24 jam. Riwayat baru diminta setelah kontak
// berhasil. Aman dipanggil berulang (setelah onboarding, cron, tombol coba
// lagi): yang sudah "diminta" tidak pernah dipanggil lagi.
export async function runPendingSyncs(
  store: OnboardingStore,
  config: Pick<TechProviderConfig, "encryptionKey" | "graph">,
  ids: string[] | null,
  now: Date = new Date(),
): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = [];
  const tokens = new Map<string, string | null>();

  for (const n of await store.syncCandidates(ids)) {
    const expired = !n.sync_batas || new Date(n.sync_batas).getTime() < now.getTime();
    let previousOk = true;
    for (const { kind, type } of SYNC_ORDER) {
      const status = statusOf(n, kind);
      if (status === "diminta") continue;
      if (!previousOk || !retryable(status)) break;
      if (expired) {
        outcomes.push({ id: n.id, kind, status: "kedaluwarsa" });
        break;
      }
      if (!(await store.claimSync(n.id, kind))) break;

      try {
        if (!tokens.has(n.waba_id)) {
          const enc = await store.getEncryptedToken(n.waba_id);
          tokens.set(n.waba_id, enc ? decryptSecret(enc, config.encryptionKey) : null);
        }
        const token = tokens.get(n.waba_id);
        if (!token) throw new Error("Token bisnis untuk WABA ini tidak ditemukan.");
        await requestSmbAppData(n.phone_number_id, type, token, config.graph);
        await store.finishSync(n.id, kind, "diminta", null, now);
        outcomes.push({ id: n.id, kind, status: "diminta" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await store.finishSync(n.id, kind, "gagal", message.slice(0, 500), now);
        outcomes.push({ id: n.id, kind, status: "gagal", error: message });
        previousOk = false;
      }
    }
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// Implementasi Supabase (client secret key; pemanggil sudah memeriksa akses)
// ---------------------------------------------------------------------------

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const CANDIDATE_COLUMNS = "id, phone_number_id, waba_id, sync_kontak_status, sync_riwayat_status, sync_batas";

export function supabaseOnboardingStore(admin: SupabaseClient): OnboardingStore {
  return {
    async tokenWorkspace(wabaId) {
      const data = check(
        await admin.from("wa_business_tokens").select("workspace_id").eq("waba_id", wabaId).maybeSingle(),
        "wa_business_tokens",
      );
      return (data?.workspace_id as string | undefined) ?? null;
    },
    async saveToken(row) {
      check(
        await admin.from("wa_business_tokens").upsert(
          {
            workspace_id: row.workspaceId,
            waba_id: row.wabaId,
            token_terenkripsi: row.encrypted,
            kedaluwarsa_pada: row.expiresAt?.toISOString() ?? null,
            dibuat_oleh: row.userId,
            diperbarui_pada: new Date().toISOString(),
          },
          { onConflict: "waba_id" },
        ),
        "wa_business_tokens",
      );
    },
    async getEncryptedToken(wabaId) {
      const data = check(
        await admin.from("wa_business_tokens").select("token_terenkripsi").eq("waba_id", wabaId).maybeSingle(),
        "wa_business_tokens",
      );
      return (data?.token_terenkripsi as string | undefined) ?? null;
    },
    async findNumber(phoneNumberId) {
      const data = check(
        await admin.from("wa_numbers").select("id, workspace_id").eq("phone_number_id", phoneNumberId).maybeSingle(),
        "wa_numbers",
      );
      return (data as { id: string; workspace_id: string } | null) ?? null;
    },
    async insertResmiNumber(row, now) {
      const data = check(
        await admin
          .from("wa_numbers")
          .insert({ ...row, ...resmiColumns(now) })
          .select("id")
          .single(),
        "wa_numbers",
      );
      return (data as { id: string }).id;
    },
    async reconnectResmiNumber(id, row, now) {
      // Label dan CS pemilik yang sudah diatur Owner dipertahankan.
      check(
        await admin
          .from("wa_numbers")
          .update({ waba_id: row.waba_id, nomor_tampil: row.nomor_tampil, ...resmiColumns(now) })
          .eq("id", id),
        "wa_numbers",
      );
    },
    async syncCandidates(ids) {
      let query = admin
        .from("wa_numbers")
        .select(CANDIDATE_COLUMNS)
        .eq("sumber", "resmi")
        .or("sync_kontak_status.in.(belum,gagal),sync_riwayat_status.in.(belum,gagal)");
      if (ids) query = query.in("id", ids);
      return (check(await query, "wa_numbers") ?? []) as SyncCandidate[];
    },
    async claimSync(id, kind) {
      const column = kind === "kontak" ? "sync_kontak_status" : "sync_riwayat_status";
      const data = check(
        await admin
          .from("wa_numbers")
          .update({ [column]: "memproses" })
          .eq("id", id)
          .in(column, ["belum", "gagal"])
          .select("id"),
        "wa_numbers",
      );
      return (data ?? []).length > 0;
    },
    async finishSync(id, kind, status, error, now) {
      const prefix = kind === "kontak" ? "sync_kontak" : "sync_riwayat";
      check(
        await admin
          .from("wa_numbers")
          .update({
            [`${prefix}_status`]: status,
            ...(status === "diminta" ? { [`${prefix}_pada`]: now.toISOString() } : {}),
            sync_error: error,
          })
          .eq("id", id),
        "wa_numbers",
      );
    },
  };
}

function resmiColumns(now: Date) {
  return {
    sumber: "resmi",
    resmi_sejak: now.toISOString(),
    status: "aktif",
    status_alasan: null,
    status_berubah_pada: now.toISOString(),
    // Onboarding baru = jendela 24 jam baru untuk sinkronisasi.
    sync_kontak_status: "belum",
    sync_riwayat_status: "belum",
    sync_kontak_pada: null,
    sync_riwayat_pada: null,
    sync_batas: new Date(now.getTime() + SYNC_WINDOW_MS).toISOString(),
    sync_error: null,
  };
}
