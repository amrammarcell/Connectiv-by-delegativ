-- Jalur 4 (UX): status baca per user, daftar inbox berpaginasi dengan filter,
-- nama iklan untuk semua anggota, dan versi baru fungsi dashboard dengan
-- filter nomor WA dan CS. Semua aditif: fungsi dashboard lama tidak diubah.

-- ---------------------------------------------------------------------------
-- Status baca per user per kontak
-- ---------------------------------------------------------------------------

create table public.contact_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  dibaca_pada timestamptz not null default now(),
  primary key (user_id, contact_id)
);

alter table public.contact_reads enable row level security;
revoke all on public.contact_reads from anon;

-- Hanya baris milik sendiri, dan hanya untuk kontak yang memang terlihat
-- (RLS contacts) di workspace yang sama.
create policy "melihat status baca sendiri" on public.contact_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "mencatat status baca sendiri" on public.contact_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.contacts c where c.id = contact_id and c.workspace_id = contact_reads.workspace_id)
  );

create policy "memperbarui status baca sendiri" on public.contact_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.contacts c where c.id = contact_id and c.workspace_id = contact_reads.workspace_id)
  );

create policy "menghapus status baca sendiri" on public.contact_reads
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Tandai semua kontak yang terlihat sebagai dibaca (tombol di Inbox).
create function public.mark_all_contacts_read(ws uuid)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with ins as (
    insert into public.contact_reads (user_id, contact_id, workspace_id, dibaca_pada)
    select (select auth.uid()), c.id, c.workspace_id, now()
    from public.contacts c
    where c.workspace_id = ws and c.pesan_terakhir_pada is not null
    on conflict (user_id, contact_id) do update set dibaca_pada = excluded.dibaca_pada
    returning 1
  )
  select count(*)::integer from ins;
$$;

-- ---------------------------------------------------------------------------
-- Daftar inbox: filter + keyset pagination, berjalan sebagai pemanggil (RLS).
-- p_urutan 'terbaru' (pesan terakhir, baru dulu) atau 'menunggu' (paling lama
-- menunggu dulu). Kursor = nilai urutan + id baris terakhir halaman sebelumnya.
-- Tanggal (p_dari/p_sampai) = tanggal pesan terakhir, Asia/Jakarta.
-- ---------------------------------------------------------------------------

create function public.inbox_contacts(
  ws uuid,
  p_urutan text default 'terbaru',
  p_menunggu boolean default false,
  p_belum_dibaca boolean default false,
  p_sumber text default null,
  p_wa_number uuid default null,
  p_cs uuid default null,
  p_tanpa_cs boolean default false,
  p_stage uuid default null,
  p_iklan text default null,
  p_dari date default null,
  p_sampai date default null,
  p_cari text default null,
  p_kursor_waktu timestamptz default null,
  p_kursor_id uuid default null,
  p_batas integer default 50
)
returns table (
  id uuid,
  workspace_id uuid,
  nama text,
  nomor_hp text,
  assigned_to uuid,
  stage_id uuid,
  sumber text,
  ad_id text,
  referral_headline text,
  pesan_terakhir_pada timestamptz,
  pesan_terakhir_cuplikan text,
  arah_pesan_terakhir public.arah_pesan,
  menunggu_balasan_sejak timestamptz,
  wa_number_id_terakhir uuid,
  dibaca_pada timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.workspace_id, c.nama, c.nomor_hp, c.assigned_to, c.stage_id, c.sumber, c.ad_id,
    c.referral_headline, c.pesan_terakhir_pada, c.pesan_terakhir_cuplikan, c.arah_pesan_terakhir,
    c.menunggu_balasan_sejak, c.wa_number_id_terakhir, r.dibaca_pada
  from public.contacts c
  left join public.contact_reads r on r.contact_id = c.id and r.user_id = (select auth.uid())
  where c.workspace_id = ws
    and c.pesan_terakhir_pada is not null
    and ((not p_menunggu and p_urutan <> 'menunggu') or c.menunggu_balasan_sejak is not null)
    and (not p_belum_dibaca or (
      c.arah_pesan_terakhir = 'masuk' and (r.dibaca_pada is null or r.dibaca_pada < c.pesan_terakhir_pada)
    ))
    and (p_sumber is null or c.sumber = p_sumber)
    and (p_wa_number is null or c.wa_number_id_terakhir = p_wa_number)
    and (p_cs is null or c.assigned_to = p_cs)
    and (not p_tanpa_cs or c.assigned_to is null)
    and (p_stage is null or c.stage_id = p_stage)
    and (p_iklan is null or c.ad_id = p_iklan)
    and (p_dari is null or (c.pesan_terakhir_pada at time zone 'Asia/Jakarta')::date >= p_dari)
    and (p_sampai is null or (c.pesan_terakhir_pada at time zone 'Asia/Jakarta')::date <= p_sampai)
    and (
      p_cari is null or btrim(p_cari) = ''
      or c.nama ilike '%' || replace(replace(replace(btrim(p_cari), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      -- angka saja; awalan 0 (format lokal) dicocokkan sebagai 62
      or (regexp_replace(p_cari, '\D', '', 'g') <> ''
        and c.nomor_hp like '%' || regexp_replace(regexp_replace(p_cari, '\D', '', 'g'), '^0', '62') || '%')
    )
    and (
      p_kursor_waktu is null
      or (p_urutan = 'menunggu' and (c.menunggu_balasan_sejak, c.id) > (p_kursor_waktu, p_kursor_id))
      or (p_urutan <> 'menunggu' and (c.pesan_terakhir_pada, c.id) < (p_kursor_waktu, p_kursor_id))
    )
  order by
    case when p_urutan = 'menunggu' then c.menunggu_balasan_sejak end asc,
    case when p_urutan <> 'menunggu' then c.pesan_terakhir_pada end desc,
    case when p_urutan = 'menunggu' then c.id end asc,
    case when p_urutan <> 'menunggu' then c.id end desc
  limit least(greatest(coalesce(p_batas, 50), 1), 200);
$$;

-- Jumlah untuk chip filter Inbox (kontak yang terlihat oleh pemanggil).
create function public.inbox_summary(ws uuid)
returns table (total bigint, menunggu bigint, iklan bigint, belum_dibaca bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*),
    count(*) filter (where c.menunggu_balasan_sejak is not null),
    count(*) filter (where c.sumber = 'ctwa'),
    count(*) filter (
      where c.arah_pesan_terakhir = 'masuk' and (r.dibaca_pada is null or r.dibaca_pada < c.pesan_terakhir_pada)
    )
  from public.contacts c
  left join public.contact_reads r on r.contact_id = c.id and r.user_id = (select auth.uid())
  where c.workspace_id = ws and c.pesan_terakhir_pada is not null;
$$;

-- ---------------------------------------------------------------------------
-- Nama iklan untuk semua anggota workspace (termasuk CS). Tabel ads hanya
-- terbaca Owner/Supervisor karena berisi spend; fungsi ini hanya membuka
-- id + nama iklan, digabung dengan iklan yang hanya dikenal dari referral chat.
-- ---------------------------------------------------------------------------

-- Nama dari tabel ads (Meta) diutamakan; headline referral hanya cadangan.
create function public.workspace_ad_names(ws uuid)
returns table (meta_ad_id text, nama text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (x.meta_ad_id) x.meta_ad_id, x.nama
  from (
    select a.meta_ad_id, a.nama_iklan as nama, 1 as prioritas
    from public.ads a
    where a.workspace_id = ws and a.nama_iklan is not null
    union all
    select c.ad_id, c.referral_headline, 2
    from public.contacts c
    where c.workspace_id = ws and c.ad_id is not null
  ) x
  where public.is_member(ws) or public.is_super_admin()
  order by x.meta_ad_id, x.prioritas, x.nama nulls last;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard v2: filter per nomor WA (nomor terakhir kontak) dan per CS
-- (assigned_to kontak). Spend iklan tidak bisa dipecah per nomor/CS, jadi
-- tetap spend penuh iklan.
-- ---------------------------------------------------------------------------

create function public.dashboard_ads_v2(ws uuid, dari date, sampai date, p_wa_number uuid default null, p_cs uuid default null)
returns table (
  meta_ad_id text,
  nama_iklan text,
  nama_campaign text,
  spend numeric,
  chat bigint,
  closing bigint,
  revenue numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with kontak as (
    select c.id, c.ad_id
    from public.contacts c
    where c.workspace_id = ws
      and (c.dibuat_pada at time zone 'Asia/Jakarta')::date between dari and sampai
      and (p_wa_number is null or c.wa_number_id_terakhir = p_wa_number)
      and (p_cs is null or c.assigned_to = p_cs)
  ),
  nilai as (
    select d.contact_id, sum(d.nilai) as revenue
    from public.deals d
    join kontak k on k.id = d.contact_id
    where d.status = 'closing'
    group by d.contact_id
  ),
  hasil as (
    select k.ad_id, count(*) as chat, count(n.contact_id) as closing, coalesce(sum(n.revenue), 0) as revenue
    from kontak k
    left join nilai n on n.contact_id = k.id
    group by k.ad_id
  ),
  biaya as (
    select a.meta_ad_id, sum(i.spend) as spend
    from public.ad_insights_daily i
    join public.ads a on a.id = i.ad_id
    where i.workspace_id = ws and i.tanggal between dari and sampai
    group by a.meta_ad_id
  )
  select
    coalesce(h.ad_id, b.meta_ad_id) as meta_ad_id,
    coalesce(
      a.nama_iklan,
      (select c.referral_headline from public.contacts c
       where c.workspace_id = ws and c.ad_id = coalesce(h.ad_id, b.meta_ad_id) and c.referral_headline is not null
       limit 1)
    ) as nama_iklan,
    a.nama_campaign,
    coalesce(b.spend, 0) as spend,
    coalesce(h.chat, 0) as chat,
    coalesce(h.closing, 0) as closing,
    coalesce(h.revenue, 0) as revenue
  from hasil h
  full outer join biaya b on b.meta_ad_id = h.ad_id
  left join public.ads a on a.workspace_id = ws and a.meta_ad_id = coalesce(h.ad_id, b.meta_ad_id);
$$;

create function public.dashboard_funnel_v2(ws uuid, dari date, sampai date, p_wa_number uuid default null, p_cs uuid default null)
returns table (stage_id uuid, nama text, urutan integer, tipe public.tipe_stage, jumlah bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with kontak as (
    select c.id
    from public.contacts c
    where c.workspace_id = ws
      and (c.dibuat_pada at time zone 'Asia/Jakarta')::date between dari and sampai
      and (p_wa_number is null or c.wa_number_id_terakhir = p_wa_number)
      and (p_cs is null or c.assigned_to = p_cs)
  ),
  capai as (
    select k.id,
      max(s.urutan) filter (where s.tipe = 'normal') as maks,
      coalesce(bool_or(s.tipe = 'closing'), false) as closing
    from kontak k
    join public.stage_history h on h.contact_id = k.id
    join public.stages s on s.id = h.ke_stage
    group by k.id
  )
  select s.id, s.nama, s.urutan, s.tipe,
    case
      when s.tipe = 'closing' then (select count(*) from capai where closing)
      else (select count(*) from capai where closing or maks >= s.urutan)
    end as jumlah
  from public.stages s
  where s.workspace_id = ws and s.tipe <> 'lost'
  order by s.urutan;
$$;

create function public.dashboard_lost_reasons_v2(ws uuid, dari date, sampai date, p_wa_number uuid default null, p_cs uuid default null)
returns table (alasan public.alasan_lost, jumlah bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.alasan_lost, count(*)
  from public.deals d
  join public.contacts c on c.id = d.contact_id
  where d.workspace_id = ws
    and d.status = 'lost'
    and (d.pada at time zone 'Asia/Jakarta')::date between dari and sampai
    and (p_wa_number is null or c.wa_number_id_terakhir = p_wa_number)
    and (p_cs is null or c.assigned_to = p_cs)
  group by d.alasan_lost
  order by count(*) desc;
$$;

create function public.dashboard_response_v2(ws uuid, dari date, sampai date, p_wa_number uuid default null, p_cs uuid default null)
returns table (
  assigned_to uuid,
  is_total boolean,
  total bigint,
  dibalas bigint,
  median_menit numeric,
  p90_menit numeric,
  cepat bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select msg.contact_id, msg.arah, msg.dikirim_pada,
      lag(msg.arah) over (partition by msg.contact_id order by msg.dikirim_pada) as arah_sebelum
    from public.messages msg
    where msg.workspace_id = ws and not msg.dari_history
      and (p_wa_number is null or msg.wa_number_id = p_wa_number)
  ),
  mulai as (
    select contact_id, dikirim_pada
    from m
    where arah = 'masuk'
      and (arah_sebelum is null or arah_sebelum = 'keluar')
      and (dikirim_pada at time zone 'Asia/Jakarta')::date between dari and sampai
  ),
  pasang as (
    select mu.contact_id,
      extract(epoch from (
        (select min(x.dikirim_pada) from public.messages x
         where x.contact_id = mu.contact_id and x.arah = 'keluar' and not x.dari_history
           and x.dikirim_pada > mu.dikirim_pada)
        - mu.dikirim_pada
      )) / 60.0 as menit
    from mulai mu
  ),
  batas as (
    select w.batas_kuning_menit as kuning from public.workspaces w where w.id = ws
  )
  select
    c.assigned_to,
    grouping(c.assigned_to) = 1 as is_total,
    count(*) as total,
    count(p.menit) as dibalas,
    round(percentile_cont(0.5) within group (order by p.menit)::numeric, 1) as median_menit,
    round(percentile_cont(0.9) within group (order by p.menit)::numeric, 1) as p90_menit,
    count(*) filter (where p.menit <= (select kuning from batas)) as cepat
  from pasang p
  join public.contacts c on c.id = p.contact_id
  where p_cs is null or c.assigned_to = p_cs
  group by grouping sets ((c.assigned_to), ());
$$;

revoke execute on function
  public.mark_all_contacts_read(uuid),
  public.inbox_contacts(uuid, text, boolean, boolean, text, uuid, uuid, boolean, uuid, text, date, date, text, timestamptz, uuid, integer),
  public.inbox_summary(uuid),
  public.workspace_ad_names(uuid),
  public.dashboard_ads_v2(uuid, date, date, uuid, uuid),
  public.dashboard_funnel_v2(uuid, date, date, uuid, uuid),
  public.dashboard_lost_reasons_v2(uuid, date, date, uuid, uuid),
  public.dashboard_response_v2(uuid, date, date, uuid, uuid)
from public, anon;

grant execute on function
  public.mark_all_contacts_read(uuid),
  public.inbox_contacts(uuid, text, boolean, boolean, text, uuid, uuid, boolean, uuid, text, date, date, text, timestamptz, uuid, integer),
  public.inbox_summary(uuid),
  public.workspace_ad_names(uuid),
  public.dashboard_ads_v2(uuid, date, date, uuid, uuid),
  public.dashboard_funnel_v2(uuid, date, date, uuid, uuid),
  public.dashboard_lost_reasons_v2(uuid, date, date, uuid, uuid),
  public.dashboard_response_v2(uuid, date, date, uuid, uuid)
to authenticated;
