-- Sprint 2 (awal): penampung payload webhook mentah. Setiap request disimpan
-- dulu sebelum diproses, supaya tidak ada pesan hilang dan payload asli bisa
-- dipakai untuk debug dan fixture test.

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  sumber text not null default 'whatsapp',
  -- Nilai `changes[].field` pertama (messages, smb_message_echoes, history, ...)
  -- supaya mudah difilter tanpa membuka payload.
  jenis text,
  payload_mentah jsonb not null,
  -- null = tidak ada signature yang bisa diverifikasi (mis. lewat Dualhook).
  signature_valid boolean,
  diproses boolean not null default false,
  percobaan integer not null default 0,
  error text,
  diterima_pada timestamptz not null default now(),
  diproses_pada timestamptz
);

create index webhook_events_belum_diproses_idx
  on public.webhook_events (diterima_pada)
  where not diproses;

-- Hanya server (secret key) yang boleh membaca dan menulis. Tanpa policy,
-- RLS menolak semua akses dari user dan anonim.
alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;
