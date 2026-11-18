-- Closing dan Lost (PRD F7). Setiap penandaan disimpan sebagai deal, dan
-- kontak dipindah ke stage Closing/Lost dalam satu transaksi.

create type public.status_deal as enum ('closing', 'lost');
-- Daftar alasan tetap supaya bisa dihitung di dashboard.
create type public.alasan_lost as enum (
  'harga', 'tidak_membalas', 'tidak_sesuai', 'kompetitor', 'hanya_bertanya', 'lainnya'
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  status public.status_deal not null,
  -- Rupiah tanpa desimal.
  nilai bigint check (nilai is null or nilai > 0),
  alasan_lost public.alasan_lost,
  catatan text check (catatan is null or length(catatan) <= 500),
  oleh_user uuid references public.profiles (id) on delete set null default auth.uid(),
  pada timestamptz not null default now(),
  check (status <> 'closing' or (nilai is not null and alasan_lost is null)),
  check (status <> 'lost' or (alasan_lost is not null and nilai is null)),
  check (alasan_lost is distinct from 'lainnya' or length(trim(coalesce(catatan, ''))) > 0)
);

create index deals_contact_idx on public.deals (contact_id, pada desc);
create index deals_workspace_idx on public.deals (workspace_id, pada desc);

alter table public.deals enable row level security;
revoke all on public.deals from anon;
revoke update, delete on public.deals from authenticated;

create policy "melihat deal dari kontak yang terlihat" on public.deals
  for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id));

create policy "mencatat deal pada kontak yang terlihat" on public.deals
  for insert to authenticated
  with check (
    oleh_user = (select auth.uid())
    and exists (select 1 from public.contacts c where c.id = contact_id and c.workspace_id = deals.workspace_id)
  );

alter publication supabase_realtime add table public.deals;

-- Berjalan sebagai pemanggil: RLS kontak dan deal tetap berlaku.
create function public.close_contact(
  p_contact_id uuid,
  p_status public.status_deal,
  p_nilai bigint,
  p_alasan public.alasan_lost,
  p_catatan text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact public.contacts;
  v_stage uuid;
  v_deal uuid;
begin
  select * into v_contact from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'Kontak tidak ditemukan' using errcode = '42501';
  end if;

  select id into v_stage
  from public.stages
  where workspace_id = v_contact.workspace_id and tipe = p_status::text::public.tipe_stage;
  if v_stage is null then
    raise exception 'Stage % tidak ada di workspace', p_status using errcode = '22023';
  end if;

  insert into public.deals (workspace_id, contact_id, status, nilai, alasan_lost, catatan, oleh_user)
  values (
    v_contact.workspace_id,
    p_contact_id,
    p_status,
    case when p_status = 'closing' then p_nilai end,
    case when p_status = 'lost' then p_alasan end,
    nullif(trim(p_catatan), ''),
    (select auth.uid())
  )
  returning id into v_deal;

  update public.contacts set stage_id = v_stage where id = p_contact_id;
  if not found then
    raise exception 'Tidak diizinkan mengubah kontak ini' using errcode = '42501';
  end if;

  return v_deal;
end;
$$;

revoke execute on function public.close_contact(uuid, public.status_deal, bigint, public.alasan_lost, text) from public, anon;
grant execute on function public.close_contact(uuid, public.status_deal, bigint, public.alasan_lost, text) to authenticated;
