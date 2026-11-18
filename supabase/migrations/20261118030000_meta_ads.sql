-- Sprint 6: data iklan Meta (spend harian per iklan) untuk dashboard.

create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Format Meta: act_1234567890.
  meta_ad_account_id text not null check (meta_ad_account_id ~ '^act_[0-9]+$'),
  nama text,
  aktif boolean not null default true,
  status_sync text not null default 'belum' check (status_sync in ('belum', 'ok', 'gagal')),
  terakhir_sync_pada timestamptz,
  error_terakhir text,
  dibuat_pada timestamptz not null default now(),
  unique (workspace_id, meta_ad_account_id)
);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ad_account_id uuid references public.ad_accounts (id) on delete set null,
  -- Sama dengan referral.source_id pada chat CTWA (contacts.ad_id).
  meta_ad_id text not null,
  nama_iklan text,
  nama_adset text,
  nama_campaign text,
  diperbarui_pada timestamptz not null default now(),
  unique (workspace_id, meta_ad_id)
);

create table public.ad_insights_daily (
  ad_id uuid not null references public.ads (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Tanggal menurut zona waktu ad account.
  tanggal date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  klik bigint not null default 0,
  percakapan_dimulai bigint not null default 0,
  diperbarui_pada timestamptz not null default now(),
  primary key (ad_id, tanggal)
);

create index ad_insights_workspace_idx on public.ad_insights_daily (workspace_id, tanggal);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  jenis text not null default 'meta_ads',
  workspace_id uuid references public.workspaces (id) on delete cascade,
  ad_account_id uuid references public.ad_accounts (id) on delete cascade,
  mulai timestamptz not null default now(),
  selesai timestamptz,
  status text not null default 'berjalan' check (status in ('berjalan', 'ok', 'gagal')),
  baris integer,
  error text
);

create index sync_runs_mulai_idx on public.sync_runs (mulai desc);

-- Data iklan hanya dibaca Owner/Supervisor (CS tidak melihat dashboard).
-- Penulisan oleh server (secret key) atau Super Admin.
alter table public.ad_accounts enable row level security;
alter table public.ads enable row level security;
alter table public.ad_insights_daily enable row level security;
alter table public.sync_runs enable row level security;

revoke all on public.ad_accounts, public.ads, public.ad_insights_daily, public.sync_runs from anon;
revoke insert, update, delete on public.ads, public.ad_insights_daily, public.sync_runs from authenticated;
revoke update on public.ad_accounts from authenticated;
grant update (nama, aktif) on public.ad_accounts to authenticated;

create policy "owner dan supervisor melihat akun iklan" on public.ad_accounts
  for select to authenticated
  using (public.role_in(workspace_id) in ('owner', 'supervisor') or public.is_super_admin());

create policy "super admin mengelola akun iklan" on public.ad_accounts
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "owner dan supervisor melihat iklan" on public.ads
  for select to authenticated
  using (public.role_in(workspace_id) in ('owner', 'supervisor') or public.is_super_admin());

create policy "owner dan supervisor melihat insights" on public.ad_insights_daily
  for select to authenticated
  using (public.role_in(workspace_id) in ('owner', 'supervisor') or public.is_super_admin());

create policy "super admin melihat log sync" on public.sync_runs
  for select to authenticated
  using (public.is_super_admin());
