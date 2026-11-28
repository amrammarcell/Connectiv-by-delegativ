// Filter Inbox lewat URL search params. Murni (tanpa React/Supabase) supaya
// bisa dipakai di server, klien, dan test.

export type InboxTab = "semua" | "belum" | "iklan" | "baru";

export type InboxFilters = {
  tab: InboxTab;
  q: string;
  nomor: string;
  // id CS, atau "tanpa" untuk kontak yang belum di-assign
  cs: string;
  stage: string;
  iklan: string;
  dari: string;
  sampai: string;
};

export const EMPTY_FILTERS: InboxFilters = { tab: "semua", q: "", nomor: "", cs: "", stage: "", iklan: "", dari: "", sampai: "" };

const TABS: InboxTab[] = ["semua", "belum", "iklan", "baru"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AD_ID = /^[0-9A-Za-z_-]{1,64}$/;

type ParamSource = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string {
  if (typeof (source as { get?: unknown }).get === "function") return (source as { get(n: string): string | null }).get(key) ?? "";
  const v = (source as Record<string, string | string[] | undefined>)[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseInboxFilters(source: ParamSource): InboxFilters {
  const tab = read(source, "tab") as InboxTab;
  const cs = read(source, "cs");
  const dari = read(source, "dari");
  const sampai = read(source, "sampai");
  return {
    tab: TABS.includes(tab) ? tab : "semua",
    q: read(source, "q").slice(0, 100),
    nomor: UUID.test(read(source, "nomor")) ? read(source, "nomor") : "",
    cs: cs === "tanpa" || UUID.test(cs) ? cs : "",
    stage: UUID.test(read(source, "stage")) ? read(source, "stage") : "",
    iklan: AD_ID.test(read(source, "iklan")) ? read(source, "iklan") : "",
    dari: DATE.test(dari) ? dari : "",
    sampai: DATE.test(sampai) ? sampai : "",
  };
}

// Query string tanpa nilai kosong/default, urutan tetap.
export function inboxFiltersToQuery(filters: InboxFilters): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(EMPTY_FILTERS) as (keyof InboxFilters)[]) {
    const value = filters[key].trim();
    if (value && value !== EMPTY_FILTERS[key]) params.set(key, value);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(filters: InboxFilters): boolean {
  return inboxFiltersToQuery(filters) !== "";
}

// Filter lanjutan (selain tab dan pencarian) yang sedang aktif.
export function advancedFilterCount(filters: InboxFilters): number {
  return [filters.nomor, filters.cs, filters.stage, filters.iklan, filters.dari || filters.sampai].filter(Boolean).length;
}

export type InboxCursor = { waktu: string; id: string };

// Argumen fungsi SQL inbox_contacts.
export function inboxRpcArgs(workspaceId: string, filters: InboxFilters, cursor: InboxCursor | null, limit: number) {
  return {
    ws: workspaceId,
    p_urutan: filters.tab === "belum" ? "menunggu" : "terbaru",
    p_menunggu: filters.tab === "belum",
    p_belum_dibaca: filters.tab === "baru",
    p_sumber: filters.tab === "iklan" ? "ctwa" : null,
    p_wa_number: filters.nomor || null,
    p_cs: filters.cs && filters.cs !== "tanpa" ? filters.cs : null,
    p_tanpa_cs: filters.cs === "tanpa",
    p_stage: filters.stage || null,
    p_iklan: filters.iklan || null,
    p_dari: filters.dari || null,
    p_sampai: filters.sampai || null,
    p_cari: filters.q.trim() || null,
    p_kursor_waktu: cursor?.waktu ?? null,
    p_kursor_id: cursor?.id ?? null,
    p_batas: limit,
  };
}

type ContactLike = {
  id: string;
  nama: string | null;
  nomor_hp: string;
  assigned_to: string | null;
  stage_id: string | null;
  sumber: string;
  ad_id: string | null;
  pesan_terakhir_pada: string | null;
  arah_pesan_terakhir: "masuk" | "keluar" | null;
  menunggu_balasan_sejak: string | null;
  wa_number_id_terakhir: string | null;
};

// Angka dari kata kunci; awalan 0 (format lokal) menjadi 62 seperti wa_id.
export function searchDigits(q: string): string {
  return q.replace(/\D/g, "").replace(/^0/, "62");
}

const jakartaDate =(iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// Belum dibaca: pesan terakhir dari customer dan belum dibuka sejak itu.
export function isUnread(contact: Pick<ContactLike, "arah_pesan_terakhir" | "pesan_terakhir_pada">, readAt: string | null | undefined) {
  if (contact.arah_pesan_terakhir !== "masuk" || !contact.pesan_terakhir_pada) return false;
  return !readAt || new Date(readAt).getTime() < new Date(contact.pesan_terakhir_pada).getTime();
}

// Cermin klien dari WHERE inbox_contacts, untuk baris yang datang lewat Realtime.
export function matchesInboxFilters(contact: ContactLike, filters: InboxFilters, readAt: string | null | undefined): boolean {
  if (!contact.pesan_terakhir_pada) return false;
  if (filters.tab === "belum" && !contact.menunggu_balasan_sejak) return false;
  if (filters.tab === "iklan" && contact.sumber !== "ctwa") return false;
  if (filters.tab === "baru" && !isUnread(contact, readAt)) return false;
  if (filters.nomor && contact.wa_number_id_terakhir !== filters.nomor) return false;
  if (filters.cs === "tanpa" ? contact.assigned_to !== null : filters.cs && contact.assigned_to !== filters.cs) return false;
  if (filters.stage && contact.stage_id !== filters.stage) return false;
  if (filters.iklan && contact.ad_id !== filters.iklan) return false;
  const day = jakartaDate(contact.pesan_terakhir_pada);
  if (filters.dari && day < filters.dari) return false;
  if (filters.sampai && day > filters.sampai) return false;
  const q = filters.q.trim().toLowerCase();
  if (q) {
    const digits = searchDigits(q);
    if (!(contact.nama ?? "").toLowerCase().includes(q) && !(digits && contact.nomor_hp.includes(digits))) return false;
  }
  return true;
}

// Urutan sama dengan inbox_contacts.
export function compareInbox(tab: InboxTab) {
  return (a: ContactLike, b: ContactLike) => {
    if (tab === "belum") {
      return (a.menunggu_balasan_sejak ?? "").localeCompare(b.menunggu_balasan_sejak ?? "") || a.id.localeCompare(b.id);
    }
    return (b.pesan_terakhir_pada ?? "").localeCompare(a.pesan_terakhir_pada ?? "") || b.id.localeCompare(a.id);
  };
}

export function cursorOf(contact: ContactLike, tab: InboxTab): InboxCursor | null {
  const waktu = tab === "belum" ? contact.menunggu_balasan_sejak : contact.pesan_terakhir_pada;
  return waktu ? { waktu, id: contact.id } : null;
}

// Nama iklan: nama dari Meta (tabel ads), lalu headline referral, lalu id iklan.
export function adLabel(adId: string | null, headline: string | null, adNames: Record<string, string>): string {
  if (adId && adNames[adId]) return adNames[adId]!;
  if (headline) return headline;
  return adId ? `Iklan ${adId}` : "Iklan tanpa judul";
}
