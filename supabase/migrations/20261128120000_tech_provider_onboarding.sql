-- Jalur 3: nomor WhatsApp lewat jalur resmi (Tech Provider, Embedded Signup +
-- Coexistence). Hanya aditif: baris wa_numbers lama tetap valid (sumber
-- 'dualhook'), kode lama tidak membaca kolom/tabel baru.

-- ---------------------------------------------------------------------------
-- wa_numbers: sumber koneksi dan status sinkronisasi awal
-- ---------------------------------------------------------------------------

alter table public.wa_numbers
  -- dualhook = lewat BSP Dualhook (semua nomor lama); resmi = Embedded Signup
  -- lewat app Meta Connectiv milik Delegativ.
  add column if not exists sumber text not null default 'dualhook',
  -- Terakhir kali nomor ini disambungkan lewat jalur resmi. Event pemutusan
  -- yang diterima sebelum waktu ini milik koneksi lama dan diabaikan.
  add column if not exists resmi_sejak timestamptz,
  -- Sinkronisasi kontak (smb_app_state_sync) lalu riwayat (history) lewat
  -- POST /<PHONE_NUMBER_ID>/smb_app_data. Masing-masing hanya boleh sekali
  -- dan dalam 24 jam setelah onboarding (sync_batas).
  -- null = tidak relevan (nomor Dualhook); belum → memproses → diminta | gagal.
  add column if not exists sync_kontak_status text,
  add column if not exists sync_riwayat_status text,
  add column if not exists sync_batas timestamptz,
  add column if not exists sync_error text;

alter table public.wa_numbers
  drop constraint if exists wa_numbers_sumber_check,
  add constraint wa_numbers_sumber_check check (sumber in ('dualhook', 'resmi')),
  drop constraint if exists wa_numbers_sync_kontak_status_check,
  add constraint wa_numbers_sync_kontak_status_check
    check (sync_kontak_status in ('belum', 'memproses', 'diminta', 'gagal')),
  drop constraint if exists wa_numbers_sync_riwayat_status_check,
  add constraint wa_numbers_sync_riwayat_status_check
    check (sync_riwayat_status in ('belum', 'memproses', 'diminta', 'gagal'));

-- Kolom baru tidak bisa diubah sesi user: hak update authenticated tetap
-- hanya (label, cs_pemilik) dari migrasi Sprint 2.

-- ---------------------------------------------------------------------------
-- Token bisnis per WABA (hasil tukar code Embedded Signup), terenkripsi
-- AES-256-GCM di aplikasi. Tidak pernah bisa dibaca user: RLS aktif tanpa
-- policy dan tanpa grant untuk anon/authenticated; hanya service_role.
-- ---------------------------------------------------------------------------

create table if not exists public.wa_business_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  waba_id text not null unique,
  token_terenkripsi text not null,
  kedaluwarsa_pada timestamptz,
  dibuat_oleh uuid references public.profiles (id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create index if not exists wa_business_tokens_workspace_id_idx on public.wa_business_tokens (workspace_id);

alter table public.wa_business_tokens enable row level security;
revoke all on public.wa_business_tokens from anon, authenticated;
grant all on public.wa_business_tokens to service_role;
