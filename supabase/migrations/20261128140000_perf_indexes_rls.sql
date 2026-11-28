-- Jalur 9C/9E: index untuk dashboard & inbox, policy RLS yang mengevaluasi
-- fungsi bantu sekali per query, dan laporan ukuran database untuk /admin.
--
-- Aman untuk database yang sedang dipakai:
-- - hanya menambah index/fungsi; policy diganti dengan semantik yang sama
--   (drop + create dalam satu transaksi migrasi, jadi tidak ada jeda tanpa policy);
-- - lock_timeout: jika tabel sedang terkunci lama, migrasi gagal cepat (bisa
--   diulang) daripada membuat antrean query di belakangnya.
-- Index dibuat tanpa CONCURRENTLY (migrasi berjalan di dalam transaksi);
-- tabel terbesar (messages) baru puluhan ribu baris, jadi lock tulis hanya
-- sebentar.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------

-- Kohort dashboard: dashboard_ads/funnel memfilter
-- (dibuat_pada at time zone 'Asia/Jakarta')::date between dari and sampai.
-- Index ekspresi ini cocok persis dengan filter itu (index biasa pada
-- dibuat_pada tidak bisa dipakai untuk ekspresi tanggal tersebut).
create index if not exists contacts_kohort_idx
  on public.contacts (workspace_id, ((dibuat_pada at time zone 'Asia/Jakarta')::date));

-- dashboard_ads: deal closing per kontak kohort.
create index if not exists deals_contact_status_idx on public.deals (contact_id, status);

-- dashboard_response: balasan CS pertama setelah pesan masuk
-- (contact_id = …, arah = 'keluar', not dari_history, dikirim_pada > …).
create index if not exists messages_balasan_idx
  on public.messages (contact_id, arah, dikirim_pada)
  where not dari_history;

-- dashboard_funnel join ke stage; juga mempercepat penghapusan stage (FK).
create index if not exists stage_history_ke_stage_idx on public.stage_history (ke_stage);

-- ---------------------------------------------------------------------------
-- Fungsi bantu RLS berbentuk himpunan
-- ---------------------------------------------------------------------------
-- Pola lama `public.role_in(workspace_id) = 'owner'` dipanggil sekali per
-- baris (argumennya kolom). Pola baru `workspace_id in (select
-- public.my_workspace_ids(...))` tidak berkorelasi dengan baris, jadi Postgres
-- menghitungnya sekali per query (hashed subplan). `(select
-- public.is_super_admin())` juga menjadi InitPlan yang dihitung sekali.
-- Fungsi lama (role_in, is_member, can_view_contact, shares_workspace) tetap
-- ada untuk fungsi SQL lain dan branch lain yang mungkin memakainya.

create or replace function public.my_workspace_ids(roles public.peran_workspace[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and (roles is null or m.peran = any (roles));
$$;

-- User yang berbagi minimal satu workspace dengan pemanggil (termasuk dirinya).
create or replace function public.my_coworker_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct theirs.user_id
  from public.memberships mine
  join public.memberships theirs on theirs.workspace_id = mine.workspace_id
  where mine.user_id = (select auth.uid());
$$;

revoke execute on function public.my_workspace_ids(public.peran_workspace[]), public.my_coworker_ids() from public, anon;
grant execute on function public.my_workspace_ids(public.peran_workspace[]), public.my_coworker_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Policy: semantik sama, pola evaluasi sekali per query
-- ---------------------------------------------------------------------------
-- Pemetaan (role per (user, workspace) unik karena primary key memberships):
--   is_member(ws)                       → ws in (select my_workspace_ids())
--   role_in(ws) = 'owner'               → ws in (select my_workspace_ids('{owner}'))
--   role_in(ws) in ('owner','supervisor') → ws in (select my_workspace_ids('{owner,supervisor}'))
--   role_in(ws) = 'cs'                  → ws in (select my_workspace_ids('{cs}'))
--   shares_workspace(id)                → id in (select my_coworker_ids())
--   is_super_admin()                    → (select is_super_admin())
-- Nilai NULL (bukan anggota) tetap berarti "ditolak" di kedua bentuk.

-- workspaces
drop policy if exists "anggota melihat workspace" on public.workspaces;
create policy "anggota melihat workspace" on public.workspaces
  for select to authenticated
  using (id in (select public.my_workspace_ids()) or (select public.is_super_admin()));

drop policy if exists "owner mengubah workspace" on public.workspaces;
create policy "owner mengubah workspace" on public.workspaces
  for update to authenticated
  using (id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()))
  with check (id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()));

drop policy if exists "super admin membuat workspace" on public.workspaces;
create policy "super admin membuat workspace" on public.workspaces
  for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists "super admin menghapus workspace" on public.workspaces;
create policy "super admin menghapus workspace" on public.workspaces
  for delete to authenticated
  using ((select public.is_super_admin()));

-- profiles
drop policy if exists "melihat profil sendiri dan rekan workspace" on public.profiles;
create policy "melihat profil sendiri dan rekan workspace" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select public.my_coworker_ids())
    or (select public.is_super_admin())
  );

-- memberships
drop policy if exists "melihat keanggotaan" on public.memberships;
create policy "melihat keanggotaan" on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or workspace_id in (select public.my_workspace_ids('{owner,supervisor}'))
    or (select public.is_super_admin())
  );

drop policy if exists "owner menambah anggota" on public.memberships;
create policy "owner menambah anggota" on public.memberships
  for insert to authenticated
  with check (workspace_id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()));

drop policy if exists "owner mengubah peran anggota lain" on public.memberships;
create policy "owner mengubah peran anggota lain" on public.memberships
  for update to authenticated
  using (
    (workspace_id in (select public.my_workspace_ids('{owner}')) and user_id <> (select auth.uid()))
    or (select public.is_super_admin())
  )
  with check (workspace_id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()));

drop policy if exists "owner menghapus anggota lain" on public.memberships;
create policy "owner menghapus anggota lain" on public.memberships
  for delete to authenticated
  using (
    (workspace_id in (select public.my_workspace_ids('{owner}')) and user_id <> (select auth.uid()))
    or (select public.is_super_admin())
  );

-- stages
drop policy if exists "anggota melihat stage" on public.stages;
create policy "anggota melihat stage" on public.stages
  for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()) or (select public.is_super_admin()));

drop policy if exists "owner mengelola stage" on public.stages;
create policy "owner mengelola stage" on public.stages
  for all to authenticated
  using (workspace_id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()))
  with check (workspace_id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()));

-- wa_numbers
drop policy if exists "anggota melihat nomor WA" on public.wa_numbers;
create policy "anggota melihat nomor WA" on public.wa_numbers
  for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()) or (select public.is_super_admin()));

drop policy if exists "super admin menambah nomor WA" on public.wa_numbers;
create policy "super admin menambah nomor WA" on public.wa_numbers
  for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists "owner mengubah nomor WA" on public.wa_numbers;
create policy "owner mengubah nomor WA" on public.wa_numbers
  for update to authenticated
  using (workspace_id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()))
  with check (workspace_id in (select public.my_workspace_ids('{owner}')) or (select public.is_super_admin()));

drop policy if exists "super admin menghapus nomor WA" on public.wa_numbers;
create policy "super admin menghapus nomor WA" on public.wa_numbers
  for delete to authenticated
  using ((select public.is_super_admin()));

-- contacts: sama dengan can_view_contact(workspace_id, assigned_to).
-- Policy ini juga dipakai (lewat EXISTS) oleh messages, stage_history,
-- contact_notes, dan deals, jadi query pesan & dashboard ikut lebih cepat;
-- policy tabel-tabel itu tidak perlu diubah.
drop policy if exists "melihat kontak sesuai peran" on public.contacts;
create policy "melihat kontak sesuai peran" on public.contacts
  for select to authenticated
  using (
    (select public.is_super_admin())
    or workspace_id in (select public.my_workspace_ids('{owner,supervisor}'))
    or (assigned_to = (select auth.uid()) and workspace_id in (select public.my_workspace_ids('{cs}')))
  );

drop policy if exists "mengubah kontak sesuai peran" on public.contacts;
create policy "mengubah kontak sesuai peran" on public.contacts
  for update to authenticated
  using (
    (select public.is_super_admin())
    or workspace_id in (select public.my_workspace_ids('{owner,supervisor}'))
    or (assigned_to = (select auth.uid()) and workspace_id in (select public.my_workspace_ids('{cs}')))
  )
  with check (
    (select public.is_super_admin())
    or workspace_id in (select public.my_workspace_ids('{owner,supervisor}'))
    or (assigned_to = (select auth.uid()) and workspace_id in (select public.my_workspace_ids('{cs}')))
  );

-- contact_notes
drop policy if exists "menghapus catatan sendiri atau sebagai owner" on public.contact_notes;
create policy "menghapus catatan sendiri atau sebagai owner" on public.contact_notes
  for delete to authenticated
  using (
    oleh_user = (select auth.uid())
    or workspace_id in (select public.my_workspace_ids('{owner}'))
    or (select public.is_super_admin())
  );

-- Meta Ads
drop policy if exists "owner dan supervisor melihat akun iklan" on public.ad_accounts;
create policy "owner dan supervisor melihat akun iklan" on public.ad_accounts
  for select to authenticated
  using (workspace_id in (select public.my_workspace_ids('{owner,supervisor}')) or (select public.is_super_admin()));

drop policy if exists "super admin mengelola akun iklan" on public.ad_accounts;
create policy "super admin mengelola akun iklan" on public.ad_accounts
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists "owner dan supervisor melihat iklan" on public.ads;
create policy "owner dan supervisor melihat iklan" on public.ads
  for select to authenticated
  using (workspace_id in (select public.my_workspace_ids('{owner,supervisor}')) or (select public.is_super_admin()));

drop policy if exists "owner dan supervisor melihat insights" on public.ad_insights_daily;
create policy "owner dan supervisor melihat insights" on public.ad_insights_daily
  for select to authenticated
  using (workspace_id in (select public.my_workspace_ids('{owner,supervisor}')) or (select public.is_super_admin()));

drop policy if exists "super admin melihat log sync" on public.sync_runs;
create policy "super admin melihat log sync" on public.sync_runs
  for select to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- 9B/9E: ukuran database untuk /admin (hanya Super Admin)
-- ---------------------------------------------------------------------------

create or replace function public.db_size_report()
returns table (nama text, total_bytes bigint, perkiraan_baris bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'hanya Super Admin' using errcode = '42501';
  end if;

  -- Baris pertama: seluruh database. Sisanya: tabel schema public (termasuk
  -- index dan TOAST), urut dari yang terbesar.
  return query
    select '(database)'::text, pg_catalog.pg_database_size(pg_catalog.current_database()), null::bigint
    union all
    select * from (
      select c.relname::text, pg_catalog.pg_total_relation_size(c.oid), greatest(c.reltuples, 0)::bigint
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by 2 desc
    ) t;
end;
$$;

revoke execute on function public.db_size_report() from public, anon;
grant execute on function public.db_size_report() to authenticated;

reset lock_timeout;
