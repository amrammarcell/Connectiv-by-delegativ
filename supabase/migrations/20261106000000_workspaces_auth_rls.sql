-- Sprint 1: workspace, profil, keanggotaan, stage, dan row-level security.
-- Prinsip: isolasi antar workspace dijaga di database. Client dengan secret
-- key (service_role) melewati semua aturan ini dan hanya dipakai di server.

-- ---------------------------------------------------------------------------
-- Tipe
-- ---------------------------------------------------------------------------

create type public.peran_workspace as enum ('owner', 'supervisor', 'cs');
create type public.tipe_stage as enum ('normal', 'closing', 'lost');

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 48),
  zona_waktu text not null default 'Asia/Jakarta',
  batas_kuning_menit integer not null default 15 check (batas_kuning_menit > 0),
  batas_merah_menit integer not null default 60,
  dibuat_pada timestamptz not null default now(),
  check (batas_merah_menit > batas_kuning_menit)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nama text,
  is_super_admin boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create unique index profiles_email_idx on public.profiles (lower(email));

create table public.memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  peran public.peran_workspace not null,
  dibuat_pada timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create index memberships_workspace_id_idx on public.memberships (workspace_id);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  nama text not null check (length(trim(nama)) > 0),
  urutan integer not null,
  tipe public.tipe_stage not null default 'normal',
  unique (workspace_id, urutan) deferrable initially immediate
);

create index stages_workspace_id_idx on public.stages (workspace_id);
-- Tepat satu stage Closing dan satu stage Lost per workspace (dipakai dashboard).
create unique index stages_satu_closing_idx on public.stages (workspace_id) where tipe = 'closing';
create unique index stages_satu_lost_idx on public.stages (workspace_id) where tipe = 'lost';

-- ---------------------------------------------------------------------------
-- Fungsi bantu untuk RLS (security definer supaya tidak rekursif ke RLS)
-- ---------------------------------------------------------------------------

create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create function public.role_in(ws uuid)
returns public.peran_workspace
language sql
stable
security definer
set search_path = ''
as $$
  select m.peran
  from public.memberships m
  where m.workspace_id = ws and m.user_id = (select auth.uid());
$$;

create function public.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.role_in(ws) is not null;
$$;

create function public.shares_workspace(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user
  );
$$;

revoke execute on function public.is_super_admin(), public.role_in(uuid), public.is_member(uuid),
  public.shares_workspace(uuid) from public, anon;
grant execute on function public.is_super_admin(), public.role_in(uuid), public.is_member(uuid),
  public.shares_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

-- Profil dibuat otomatis setiap ada user baru di Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, nama)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'nama'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Stage default PRD F6 dibuat untuk setiap workspace baru.
create function public.create_default_stages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stages (workspace_id, nama, urutan, tipe) values
    (new.id, 'Baru', 1, 'normal'),
    (new.id, 'Dihubungi', 2, 'normal'),
    (new.id, 'Tertarik', 3, 'normal'),
    (new.id, 'Negosiasi', 4, 'normal'),
    (new.id, 'Closing', 5, 'closing'),
    (new.id, 'Lost', 6, 'lost');
  return new;
end;
$$;

create trigger workspaces_default_stages
  after insert on public.workspaces
  for each row execute function public.create_default_stages();

-- ---------------------------------------------------------------------------
-- Hak akses kolom: batasi apa yang boleh diubah lewat API
-- ---------------------------------------------------------------------------

revoke all on public.workspaces, public.profiles, public.memberships, public.stages from anon;

-- Owner hanya boleh mengubah pengaturan, bukan slug.
revoke update on public.workspaces from authenticated;
grant update (nama, zona_waktu, batas_kuning_menit, batas_merah_menit) on public.workspaces to authenticated;

-- User hanya boleh mengubah namanya sendiri; is_super_admin tidak bisa disentuh.
revoke insert, update, delete on public.profiles from authenticated;
grant update (nama) on public.profiles to authenticated;

-- Keanggotaan: hanya peran yang bisa diubah, bukan user atau workspace-nya.
revoke update on public.memberships from authenticated;
grant update (peran) on public.memberships to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.stages enable row level security;

-- workspaces
create policy "anggota melihat workspace" on public.workspaces
  for select to authenticated
  using (public.is_member(id) or public.is_super_admin());

create policy "owner mengubah workspace" on public.workspaces
  for update to authenticated
  using (public.role_in(id) = 'owner' or public.is_super_admin())
  with check (public.role_in(id) = 'owner' or public.is_super_admin());

create policy "super admin membuat workspace" on public.workspaces
  for insert to authenticated
  with check (public.is_super_admin());

create policy "super admin menghapus workspace" on public.workspaces
  for delete to authenticated
  using (public.is_super_admin());

-- profiles
create policy "melihat profil sendiri dan rekan workspace" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace(id) or public.is_super_admin());

create policy "mengubah profil sendiri" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships
create policy "melihat keanggotaan" on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.role_in(workspace_id) in ('owner', 'supervisor')
    or public.is_super_admin()
  );

create policy "owner menambah anggota" on public.memberships
  for insert to authenticated
  with check (public.role_in(workspace_id) = 'owner' or public.is_super_admin());

-- Owner tidak bisa mengubah atau menghapus dirinya sendiri, supaya workspace
-- tidak pernah kehilangan owner karena salah klik.
create policy "owner mengubah peran anggota lain" on public.memberships
  for update to authenticated
  using (
    (public.role_in(workspace_id) = 'owner' and user_id <> (select auth.uid()))
    or public.is_super_admin()
  )
  with check (public.role_in(workspace_id) = 'owner' or public.is_super_admin());

create policy "owner menghapus anggota lain" on public.memberships
  for delete to authenticated
  using (
    (public.role_in(workspace_id) = 'owner' and user_id <> (select auth.uid()))
    or public.is_super_admin()
  );

-- stages
create policy "anggota melihat stage" on public.stages
  for select to authenticated
  using (public.is_member(workspace_id) or public.is_super_admin());

create policy "owner mengelola stage" on public.stages
  for all to authenticated
  using (public.role_in(workspace_id) = 'owner' or public.is_super_admin())
  with check (public.role_in(workspace_id) = 'owner' or public.is_super_admin());
