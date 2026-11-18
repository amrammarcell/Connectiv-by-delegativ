-- Sprint 4: catatan internal kontak dan pengurutan ulang stage.

create table public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  isi text not null check (length(trim(isi)) between 1 and 2000),
  oleh_user uuid references public.profiles (id) on delete set null default auth.uid(),
  pada timestamptz not null default now()
);

create index contact_notes_contact_idx on public.contact_notes (contact_id, pada desc);

alter table public.contact_notes enable row level security;
revoke all on public.contact_notes from anon;
revoke update on public.contact_notes from authenticated;

-- Siapa pun yang boleh melihat kontak boleh membaca dan menambah catatannya.
create policy "melihat catatan dari kontak yang terlihat" on public.contact_notes
  for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id));

create policy "menambah catatan pada kontak yang terlihat" on public.contact_notes
  for insert to authenticated
  with check (
    oleh_user = (select auth.uid())
    and exists (select 1 from public.contacts c where c.id = contact_id and c.workspace_id = contact_notes.workspace_id)
  );

-- Penulis menghapus catatannya sendiri; Owner boleh menghapus catatan siapa pun.
create policy "menghapus catatan sendiri atau sebagai owner" on public.contact_notes
  for delete to authenticated
  using (oleh_user = (select auth.uid()) or public.role_in(workspace_id) = 'owner' or public.is_super_admin());

alter publication supabase_realtime add table public.contact_notes;

-- ---------------------------------------------------------------------------
-- Urutan stage: stage normal bisa diurutkan ulang, Closing dan Lost selalu di
-- akhir. Berjalan sebagai pemanggil, jadi RLS (hanya Owner) tetap berlaku.
-- ---------------------------------------------------------------------------

create function public.reorder_stages(ws uuid, stage_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_normal uuid[];
  v_akhir uuid[];
  i integer;
begin
  if not (public.role_in(ws) = 'owner' or public.is_super_admin()) then
    raise exception 'Hanya Owner yang bisa mengurutkan stage' using errcode = '42501';
  end if;

  select array_agg(id order by urutan) into v_normal
  from public.stages where workspace_id = ws and tipe = 'normal';

  if v_normal is null
     or array_length(stage_ids, 1) is distinct from array_length(v_normal, 1)
     or not (stage_ids @> v_normal and v_normal @> stage_ids) then
    raise exception 'Daftar stage tidak cocok dengan stage normal workspace' using errcode = '22023';
  end if;

  select array_agg(id order by case tipe when 'closing' then 0 else 1 end) into v_akhir
  from public.stages where workspace_id = ws and tipe <> 'normal';

  set constraints public.stages_workspace_id_urutan_key deferred;

  for i in 1 .. array_length(stage_ids, 1) loop
    update public.stages set urutan = i where id = stage_ids[i] and workspace_id = ws;
  end loop;
  for i in 1 .. coalesce(array_length(v_akhir, 1), 0) loop
    update public.stages set urutan = array_length(stage_ids, 1) + i where id = v_akhir[i] and workspace_id = ws;
  end loop;
end;
$$;

revoke execute on function public.reorder_stages(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_stages(uuid, uuid[]) to authenticated;

-- Hanya nama dan urutan stage yang boleh diubah dari aplikasi.
revoke update on public.stages from authenticated;
grant update (nama, urutan) on public.stages to authenticated;
