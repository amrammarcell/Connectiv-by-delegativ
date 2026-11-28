// Kolom yang dipakai inbox. Dipakai juga untuk select Supabase supaya data
// awal (server) dan data realtime (klien) punya bentuk yang sama.

export const CONTACT_COLUMNS =
  "id, workspace_id, nama, nomor_hp, assigned_to, stage_id, sumber, ad_id, referral_headline, pesan_terakhir_pada, pesan_terakhir_cuplikan, arah_pesan_terakhir, menunggu_balasan_sejak, wa_number_id_terakhir" as const;

export type InboxContact = {
  id: string;
  workspace_id: string;
  nama: string | null;
  nomor_hp: string;
  assigned_to: string | null;
  stage_id: string | null;
  sumber: "ctwa" | "organik";
  ad_id: string | null;
  referral_headline: string | null;
  pesan_terakhir_pada: string | null;
  pesan_terakhir_cuplikan: string | null;
  arah_pesan_terakhir: "masuk" | "keluar" | null;
  menunggu_balasan_sejak: string | null;
  wa_number_id_terakhir: string | null;
};

export const MESSAGE_COLUMNS =
  "id, contact_id, wa_message_id, arah, tipe, isi, media_mime, nama_file, dari_history, dikirim_pada, diedit_pada, dihapus_pada" as const;

export type InboxMessage = {
  id: string;
  contact_id: string;
  wa_message_id: string;
  arah: "masuk" | "keluar";
  tipe: string;
  isi: string | null;
  media_mime: string | null;
  nama_file: string | null;
  dari_history: boolean;
  dikirim_pada: string;
  // Diedit / ditarik ("hapus untuk semua") oleh pengirim.
  diedit_pada: string | null;
  dihapus_pada: string | null;
};

export type Lookup = Record<string, string>;

// Ukuran halaman. Di sini (bukan di modul "use client") supaya Server
// Component mendapat angka, bukan referensi klien.
export const INBOX_PAGE_SIZE = 50;
export const MESSAGE_PAGE_SIZE = 80;
