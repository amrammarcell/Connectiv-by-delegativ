-- Jalur 5 + 7: log akses Super Admin (PRD §6), kunjungan halaman (metrik
-- dashboard ≥ 3x/minggu), alert operasional, dan fungsi metrik pilot (PRD §2.8).
-- Hanya aditif: tabel dan fungsi baru, tidak mengubah tabel lama.

-- ---------------------------------------------------------------------------
-- admin_access_log: setiap akses Super Admin ke workspace yang bukan miliknya.
-- Ditulis server (secret key) lewat log_admin_access; tidak bisa diubah user.
-- workspace_id "on delete set null" supaya jejak audit tetap ada walau
-- workspace dihapus (slug disimpan sebagai salinan).
-- ---------------------------------------------------------------------------

create table public.admin_access_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  user_email text not null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  workspace_slug text not null,
  path text not null check (length(path) <= 300),
  -- lihat = membuka halaman, aksi = Server Action (mengubah data).
  aksi text not null check (aksi in ('lihat', 'aksi')),
  pada timestamptz not null default now()
);

create index admin_access_log_pada_idx on public.admin_access_log (pada desc);
create index admin_access_log_workspace_idx on public.admin_access_log (workspace_id, pada desc);
create index admin_access_log_dedupe_idx on public.admin_access_log (user_id, workspace_id, path, pada desc);

alter table public.admin_access_log enable row level security;
revoke all on public.admin_access_log from anon, authenticated;
grant select on public.admin_access_log to authenticated;

create policy "super admin melihat log akses" on public.admin_access_log
  for select to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- page_visits: kunjungan halaman per anggota workspace, maksimal satu baris
-- per user per halaman per 30 menit.
-- ---------------------------------------------------------------------------

create table public.page_visits (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  halaman text not null check (halaman ~ '^[a-z_-]{1,40}$'),
  pada timestamptz not null default now()
);

create index page_visits_workspace_idx on public.page_visits (workspace_id, halaman, pada);
create index page_visits_dedupe_idx on public.page_visits (user_id, workspace_id, halaman, pada desc);

alter table public.page_visits enable row level security;
revoke all on public.page_visits from anon, authenticated;
grant select on public.page_visits to authenticated;

create policy "melihat kunjungan sendiri atau sebagai super admin" on public.page_visits
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- ops_alerts: alert operasional (cron, webhook, sync iklan). Satu alert
-- terbuka per jenis; kejadian berulang menambah `jumlah`.
-- ---------------------------------------------------------------------------

create table public.ops_alerts (
  id bigint generated always as identity primary key,
  jenis text not null check (jenis ~ '^[a-z_]{1,40}$'),
  judul text not null,
  detail text,
  jumlah integer not null default 1,
  pertama_pada timestamptz not null default now(),
  terakhir_pada timestamptz not null default now(),
  selesai_pada timestamptz,
  email_terkirim boolean not null default false
);

create unique index ops_alerts_terbuka_idx on public.ops_alerts (jenis) where selesai_pada is null;
create index ops_alerts_terakhir_idx on public.ops_alerts (terakhir_pada desc);

alter table public.ops_alerts enable row level security;
revoke all on public.ops_alerts from anon, authenticated;
grant select on public.ops_alerts to authenticated;

create policy "super admin melihat alert" on public.ops_alerts
  for select to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Fungsi tulis (hanya service_role)
-- ---------------------------------------------------------------------------

-- Mencatat akses Super Admin. Mengembalikan false jika tidak dicatat (bukan
-- Super Admin, anggota workspace, atau duplikat "lihat" dalam 1 menit, mis.
-- prefetch/refresh halaman yang sama).
create function public.log_admin_access(p_user uuid, p_workspace uuid, p_path text, p_aksi text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_slug text;
  v_path text := left(coalesce(nullif(p_path, ''), '/'), 300);
begin
  select p.email into v_email from public.profiles p where p.id = p_user and p.is_super_admin;
  if v_email is null then return false; end if;
  if exists (select 1 from public.memberships m where m.user_id = p_user and m.workspace_id = p_workspace) then
    return false;
  end if;
  select w.slug into v_slug from public.workspaces w where w.id = p_workspace;
  if v_slug is null then return false; end if;

  if p_aksi = 'lihat' and exists (
    select 1 from public.admin_access_log l
    where l.user_id = p_user and l.workspace_id = p_workspace and l.path = v_path
      and l.aksi = 'lihat' and l.pada > now() - interval '1 minute'
  ) then
    return false;
  end if;

  insert into public.admin_access_log (user_id, user_email, workspace_id, workspace_slug, path, aksi)
  values (p_user, v_email, p_workspace, v_slug, v_path, p_aksi);
  return true;
end;
$$;

-- Mencatat kunjungan halaman anggota workspace (dedupe 30 menit).
create function public.log_page_visit(p_user uuid, p_workspace uuid, p_halaman text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.memberships m where m.user_id = p_user and m.workspace_id = p_workspace) then
    return false;
  end if;
  if exists (
    select 1 from public.page_visits v
    where v.user_id = p_user and v.workspace_id = p_workspace and v.halaman = p_halaman
      and v.pada > now() - interval '30 minutes'
  ) then
    return false;
  end if;
  insert into public.page_visits (workspace_id, user_id, halaman) values (p_workspace, p_user, p_halaman);
  return true;
end;
$$;

-- Membuka atau memperbarui alert terbuka untuk `jenis`. `baru` = true jika
-- alert baru dibuka (pemanggil mengirim notifikasi hanya saat itu).
create function public.raise_ops_alert(p_jenis text, p_judul text, p_detail text)
returns table (id bigint, baru boolean)
language sql
security definer
set search_path = ''
as $$
  insert into public.ops_alerts as a (jenis, judul, detail)
  values (p_jenis, p_judul, left(p_detail, 4000))
  on conflict (jenis) where selesai_pada is null
  do update set judul = excluded.judul, detail = excluded.detail,
    jumlah = a.jumlah + 1, terakhir_pada = now()
  returning a.id, (a.jumlah = 1);
$$;

create function public.resolve_ops_alert(p_jenis text)
returns integer
language sql
security definer
set search_path = ''
as $$
  with s as (
    update public.ops_alerts set selesai_pada = now()
    where jenis = p_jenis and selesai_pada is null
    returning 1
  )
  select count(*)::integer from s;
$$;

-- ---------------------------------------------------------------------------
-- Metrik pilot per workspace (PRD §2.8). Tanggal Asia/Jakarta.
-- ---------------------------------------------------------------------------

create function public.pilot_json_array(v jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end;
$$;

create function public.pilot_metrics(ws uuid, dari date, sampai date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mulai timestamptz := (dari::timestamp at time zone 'Asia/Jakarta');
  v_akhir timestamptz := ((sampai + 1)::timestamp at time zone 'Asia/Jakarta');
  v_mirror jsonb;
  v_referral jsonb;
  v_closing jsonb;
  v_ctwa jsonb;
  v_visits jsonb;
  v_messages jsonb;
begin
  -- 1. Mirroring: ID pesan yang dikirim Meta lewat webhook (pesan masuk, echo
  -- balasan CS, riwayat) untuk nomor workspace ini, dibanding yang tersimpan.
  -- Tipe yang memang tidak disimpan (system, unsupported, ephemeral, edit,
  -- revoke) tidak dihitung.
  with nomor as (
    select n.phone_number_id from public.wa_numbers n where n.workspace_id = ws
  ),
  ev as (
    select e.id as event_id, e.payload_mentah as p, e.diproses
    from public.webhook_events e
    where e.diterima_pada >= v_mulai and e.diterima_pada < v_akhir
      and e.signature_valid is distinct from false
  ),
  ch as (
    select ev.event_id, c ->> 'field' as field, c -> 'value' as v, ev.diproses
    from ev,
      jsonb_array_elements(public.pilot_json_array(ev.p -> 'entry')) en,
      jsonb_array_elements(public.pilot_json_array(en -> 'changes')) c
    where c -> 'value' -> 'metadata' ->> 'phone_number_id' in (select phone_number_id from nomor)
  ),
  msg as (
    select ch.field, m from ch, jsonb_array_elements(public.pilot_json_array(ch.v -> 'messages')) m
    where ch.field = 'messages'
    union all
    select ch.field, m from ch, jsonb_array_elements(public.pilot_json_array(ch.v -> 'message_echoes')) m
    where ch.field = 'smb_message_echoes'
    union all
    select ch.field, m
    from ch,
      jsonb_array_elements(public.pilot_json_array(ch.v -> 'history')) h,
      jsonb_array_elements(public.pilot_json_array(h -> 'threads')) t,
      jsonb_array_elements(public.pilot_json_array(t -> 'messages')) m
    where ch.field = 'history'
  ),
  ids as (
    select m ->> 'id' as wa_id, bool_or(field = 'history') as riwayat
    from msg
    where m ->> 'id' is not null
      and coalesce(m ->> 'type', '') not in ('system', 'unsupported', 'ephemeral', 'edit', 'revoke')
    group by m ->> 'id'
  ),
  cek as (
    select ids.riwayat, exists (select 1 from public.messages x where x.wa_message_id = ids.wa_id) as ada
    from ids
  ),
  ref as (
    select m ->> 'from' as pengirim, nullif(m -> 'referral' ->> 'source_id', '') as source_id
    from msg
    where field = 'messages' and jsonb_typeof(m -> 'referral') = 'object'
  )
  select
    jsonb_build_object(
      'dikirim_meta', (select count(*) from cek),
      'tersimpan', (select count(*) from cek where ada),
      'dikirim_meta_live', (select count(*) from cek where not riwayat),
      'tersimpan_live', (select count(*) from cek where not riwayat and ada),
      'event_total', (select count(distinct ch.event_id) from ch),
      'event_belum_diproses', (select count(distinct ch.event_id) from ch where not ch.diproses)
    ),
    jsonb_build_object(
      'pelanggan_referral', (select count(distinct pengirim) from ref),
      'pelanggan_referral_dengan_id', (select count(distinct pengirim) from ref where source_id is not null)
    )
  into v_mirror, v_referral;

  -- Pesan tersimpan (non-riwayat) di rentang, untuk konteks.
  select jsonb_build_object(
    'masuk', count(*) filter (where m.arah = 'masuk'),
    'keluar', count(*) filter (where m.arah = 'keluar')
  )
  into v_messages
  from public.messages m
  where m.workspace_id = ws and not m.dari_history
    and m.dikirim_pada >= v_mulai and m.dikirim_pada < v_akhir;

  -- 2. Chat ditandai Closing/Lost: kohort kontak yang dibuat di rentang dan
  -- punya minimal satu pesan non-riwayat (chat sungguhan, bukan impor riwayat).
  with kontak as (
    select c.id
    from public.contacts c
    where c.workspace_id = ws and c.dibuat_pada >= v_mulai and c.dibuat_pada < v_akhir
      and exists (select 1 from public.messages m where m.contact_id = c.id and not m.dari_history)
  ),
  tandai as (
    select k.id,
      bool_or(d.status = 'closing') as closing,
      bool_or(d.status = 'lost') as lost
    from kontak k
    join public.deals d on d.contact_id = k.id
    group by k.id
  )
  select jsonb_build_object(
    'kontak', (select count(*) from kontak),
    'ditandai', (select count(*) from tandai),
    'closing', (select count(*) from tandai where closing),
    'lost', (select count(*) from tandai where lost and not closing)
  )
  into v_closing;

  -- 3. CTWA: percakapan dari iklan menurut Meta (insights) dibanding chat
  -- yang membawa ID iklan; plus kontak baru yang teratribusi ke iklan.
  select jsonb_build_object(
    'percakapan_meta', coalesce((
      select sum(i.percakapan_dimulai) from public.ad_insights_daily i
      where i.workspace_id = ws and i.tanggal between dari and sampai
    ), 0),
    'akun_iklan_aktif', (select count(*) from public.ad_accounts a where a.workspace_id = ws and a.aktif),
    'kontak_ctwa', (
      select count(*) from public.contacts c
      where c.workspace_id = ws and c.ad_id is not null
        and c.referral_pada >= v_mulai and c.referral_pada < v_akhir
    ),
    'kontak_ctwa_iklan_dikenal', (
      select count(*) from public.contacts c
      where c.workspace_id = ws and c.ad_id is not null
        and c.referral_pada >= v_mulai and c.referral_pada < v_akhir
        and exists (select 1 from public.ads a where a.workspace_id = ws and a.meta_ad_id = c.ad_id)
    )
  ) || v_referral
  into v_ctwa;

  -- 4. Kunjungan dashboard Owner/Supervisor.
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', x.user_id, 'nama', x.nama, 'peran', x.peran, 'kunjungan', x.kunjungan, 'terakhir', x.terakhir
  ) order by x.kunjungan desc, x.nama), '[]'::jsonb)
  into v_visits
  from (
    select m.user_id, coalesce(p.nama, p.email) as nama, m.peran::text as peran,
      count(v.id) as kunjungan, max(v.pada) as terakhir
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    left join public.page_visits v
      on v.user_id = m.user_id and v.workspace_id = ws and v.halaman = 'dashboard'
      and v.pada >= v_mulai and v.pada < v_akhir
    where m.workspace_id = ws and m.peran in ('owner', 'supervisor')
    group by m.user_id, p.nama, p.email, m.peran
  ) x;

  return jsonb_build_object(
    'mirror', v_mirror || jsonb_build_object('pesan', v_messages),
    'closing', v_closing,
    'ctwa', v_ctwa,
    'kunjungan', v_visits
  );
end;
$$;

revoke execute on function public.log_admin_access(uuid, uuid, text, text), public.log_page_visit(uuid, uuid, text),
  public.raise_ops_alert(text, text, text), public.resolve_ops_alert(text),
  public.pilot_metrics(uuid, date, date) from public, anon, authenticated;
grant execute on function public.log_admin_access(uuid, uuid, text, text), public.log_page_visit(uuid, uuid, text),
  public.raise_ops_alert(text, text, text), public.resolve_ops_alert(text),
  public.pilot_metrics(uuid, date, date) to service_role;
