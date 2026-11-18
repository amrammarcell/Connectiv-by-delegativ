-- Sprint 6: fungsi dashboard. Semua berjalan sebagai pemanggil (RLS berlaku)
-- dan memakai tanggal Asia/Jakarta. Chat dan closing dihitung dari kohort
-- kontak yang dibuat di rentang tanggal, supaya biaya per closing per iklan
-- sebanding dengan spend di periode yang sama (ARCHITECTURE §9).

create function public.dashboard_ads(ws uuid, dari date, sampai date, p_wa_number uuid default null)
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

-- Funnel: kontak dianggap mencapai sebuah stage normal jika pernah masuk ke
-- stage itu atau stage normal sesudahnya, atau sudah Closing.
create function public.dashboard_funnel(ws uuid, dari date, sampai date)
returns table (stage_id uuid, nama text, urutan integer, tipe public.tipe_stage, jumlah bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with kontak as (
    select c.id
    from public.contacts c
    where c.workspace_id = ws and (c.dibuat_pada at time zone 'Asia/Jakarta')::date between dari and sampai
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

create function public.dashboard_lost_reasons(ws uuid, dari date, sampai date)
returns table (alasan public.alasan_lost, jumlah bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.alasan_lost, count(*)
  from public.deals d
  where d.workspace_id = ws
    and d.status = 'lost'
    and (d.pada at time zone 'Asia/Jakarta')::date between dari and sampai
  group by d.alasan_lost
  order by count(*) desc;
$$;

-- Kecepatan respon: dari pesan masuk yang memulai masa menunggu (pesan
-- pertama, atau pesan masuk setelah balasan CS) sampai balasan CS berikutnya.
-- Riwayat (history sync) tidak dihitung. Baris is_total = gabungan semua CS.
create function public.dashboard_response(ws uuid, dari date, sampai date)
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
  group by grouping sets ((c.assigned_to), ());
$$;

revoke execute on function public.dashboard_ads(uuid, date, date, uuid), public.dashboard_funnel(uuid, date, date),
  public.dashboard_lost_reasons(uuid, date, date), public.dashboard_response(uuid, date, date) from public, anon;
grant execute on function public.dashboard_ads(uuid, date, date, uuid), public.dashboard_funnel(uuid, date, date),
  public.dashboard_lost_reasons(uuid, date, date), public.dashboard_response(uuid, date, date) to authenticated;
