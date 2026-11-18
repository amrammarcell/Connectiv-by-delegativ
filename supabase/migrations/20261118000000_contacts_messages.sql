-- Sprint 2: nomor WhatsApp, kontak, pesan, riwayat stage, dan fungsi ingest.

create type public.arah_pesan as enum ('masuk', 'keluar');

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------

create table public.wa_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- phone_number_id dari Meta menentukan workspace setiap webhook.
  phone_number_id text not null unique,
  waba_id text not null,
  label text not null check (length(trim(label)) > 0),
  nomor_tampil text,
  -- Sales pemilik nomor: kontak baru otomatis di-assign ke dia.
  cs_pemilik uuid references public.profiles (id) on delete set null,
  status text not null default 'aktif' check (status in ('aktif', 'terputus')),
  terakhir_terima_pesan timestamptz,
  tersambung_pada timestamptz not null default now(),
  sync_kontak_pada timestamptz,
  sync_riwayat_pada timestamptz,
  dibuat_pada timestamptz not null default now()
);

create index wa_numbers_workspace_id_idx on public.wa_numbers (workspace_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Format wa_id Meta: hanya angka dengan kode negara, mis. 6281234567890.
  nomor_hp text not null check (nomor_hp ~ '^[0-9]{6,20}$'),
  nama text,
  assigned_to uuid references public.profiles (id) on delete set null,
  stage_id uuid references public.stages (id) on delete set null,
  sumber text not null default 'organik' check (sumber in ('ctwa', 'organik')),
  -- Atribusi first-touch dari referral iklan Click-to-WhatsApp.
  ad_id text,
  ctwa_clid text,
  referral_headline text,
  referral_source_url text,
  referral_pada timestamptz,
  -- Denormalisasi untuk daftar inbox dan status waktu tanggapan (PRD F4a).
  pesan_terakhir_pada timestamptz,
  pesan_terakhir_cuplikan text,
  arah_pesan_terakhir public.arah_pesan,
  menunggu_balasan_sejak timestamptz,
  wa_number_id_terakhir uuid references public.wa_numbers (id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  unique (workspace_id, nomor_hp)
);

create index contacts_inbox_idx on public.contacts (workspace_id, pesan_terakhir_pada desc nulls last);
create index contacts_assigned_idx on public.contacts (workspace_id, assigned_to);
create index contacts_menunggu_idx on public.contacts (workspace_id, menunggu_balasan_sejak)
  where menunggu_balasan_sejak is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  wa_number_id uuid references public.wa_numbers (id) on delete set null,
  -- Idempoten: pesan yang sama tidak pernah tersimpan dua kali.
  wa_message_id text not null unique,
  arah public.arah_pesan not null,
  tipe text not null,
  isi text,
  media_id text,
  media_mime text,
  media_path text,
  nama_file text,
  dari_history boolean not null default false,
  dikirim_pada timestamptz not null,
  dibuat_pada timestamptz not null default now()
);

create index messages_contact_idx on public.messages (contact_id, dikirim_pada);
create index messages_workspace_idx on public.messages (workspace_id, dikirim_pada desc);

create table public.stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  dari_stage uuid references public.stages (id) on delete set null,
  ke_stage uuid references public.stages (id) on delete set null,
  -- null = perubahan oleh sistem (kontak baru, dibuka ulang karena chat baru).
  oleh_user uuid references public.profiles (id) on delete set null,
  pada timestamptz not null default now()
);

create index stage_history_contact_idx on public.stage_history (contact_id, pada);
create index stage_history_workspace_idx on public.stage_history (workspace_id, pada);

-- ---------------------------------------------------------------------------
-- Hak lihat kontak: Owner/Supervisor semua, CS hanya yang di-assign ke dia.
-- ---------------------------------------------------------------------------

create function public.can_view_contact(ws uuid, assigned uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin()
    or public.role_in(ws) in ('owner', 'supervisor')
    or (public.role_in(ws) = 'cs' and assigned = (select auth.uid()));
$$;

revoke execute on function public.can_view_contact(uuid, uuid) from public, anon;
grant execute on function public.can_view_contact(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Riwayat stage otomatis
-- ---------------------------------------------------------------------------

create function public.record_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.stage_history (workspace_id, contact_id, dari_stage, ke_stage, oleh_user)
    values (
      new.workspace_id,
      new.id,
      case when tg_op = 'UPDATE' then old.stage_id end,
      new.stage_id,
      (select auth.uid())
    );
  end if;
  return new;
end;
$$;

create trigger contacts_stage_history
  after insert or update of stage_id on public.contacts
  for each row execute function public.record_stage_change();

-- ---------------------------------------------------------------------------
-- Ingest satu pesan WhatsApp (dipanggil server dengan secret key)
-- ---------------------------------------------------------------------------
-- Semua langkah dalam satu transaksi supaya aman jika webhook datang
-- bersamaan atau tidak berurutan. Mengembalikan 'inserted', 'duplicate',
-- atau 'unknown_number'.

create function public.ingest_message(
  p_phone_number_id text,
  p_wa_message_id text,
  p_arah public.arah_pesan,
  p_customer_phone text,
  p_customer_name text,
  p_tipe text,
  p_isi text,
  p_media_id text,
  p_media_mime text,
  p_nama_file text,
  p_referral jsonb,
  p_dikirim_pada timestamptz,
  p_dari_history boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number public.wa_numbers;
  v_contact public.contacts;
  v_stage_baru uuid;
  v_stage_tipe public.tipe_stage;
  v_cuplikan text;
  v_message_id uuid;
begin
  select * into v_number from public.wa_numbers where phone_number_id = p_phone_number_id;
  if not found then
    return 'unknown_number';
  end if;

  if not p_dari_history then
    update public.wa_numbers
    set terakhir_terima_pesan = now(), status = 'aktif'
    where id = v_number.id;
  end if;

  select id into v_stage_baru
  from public.stages
  where workspace_id = v_number.workspace_id and tipe = 'normal'
  order by urutan
  limit 1;

  insert into public.contacts (workspace_id, nomor_hp, nama, assigned_to, stage_id, wa_number_id_terakhir)
  values (
    v_number.workspace_id,
    p_customer_phone,
    nullif(trim(p_customer_name), ''),
    v_number.cs_pemilik,
    v_stage_baru,
    v_number.id
  )
  on conflict (workspace_id, nomor_hp) do update
    set nama = coalesce(excluded.nama, public.contacts.nama)
  returning * into v_contact;

  insert into public.messages (
    workspace_id, contact_id, wa_number_id, wa_message_id, arah, tipe, isi,
    media_id, media_mime, nama_file, dari_history, dikirim_pada
  )
  values (
    v_number.workspace_id, v_contact.id, v_number.id, p_wa_message_id, p_arah, p_tipe, p_isi,
    p_media_id, p_media_mime, p_nama_file, p_dari_history, p_dikirim_pada
  )
  on conflict (wa_message_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return 'duplicate';
  end if;

  -- Atribusi first-touch: iklan pertama yang membawa kontak, tidak pernah ditimpa.
  if p_arah = 'masuk' and p_referral is not null and v_contact.ad_id is null
     and nullif(p_referral ->> 'source_id', '') is not null then
    update public.contacts
    set sumber = 'ctwa',
        ad_id = p_referral ->> 'source_id',
        ctwa_clid = p_referral ->> 'ctwa_clid',
        referral_headline = p_referral ->> 'headline',
        referral_source_url = p_referral ->> 'source_url',
        referral_pada = p_dikirim_pada
    where id = v_contact.id;
  end if;

  v_cuplikan := left(coalesce(
    nullif(trim(p_isi), ''),
    case p_tipe
      when 'image' then 'Gambar'
      when 'video' then 'Video'
      when 'audio' then 'Voice note'
      when 'document' then coalesce('Dokumen: ' || p_nama_file, 'Dokumen')
      when 'sticker' then 'Stiker'
      when 'location' then 'Lokasi'
      when 'contacts' then 'Kontak'
      else 'Pesan'
    end
  ), 140);

  -- Kolom "pesan terakhir" hanya diperbarui oleh pesan yang lebih baru, supaya
  -- riwayat yang datang tidak berurutan tidak menimpa keadaan terkini.
  update public.contacts
  set pesan_terakhir_pada = p_dikirim_pada,
      pesan_terakhir_cuplikan = v_cuplikan,
      arah_pesan_terakhir = p_arah,
      wa_number_id_terakhir = v_number.id
  where id = v_contact.id
    and (pesan_terakhir_pada is null or pesan_terakhir_pada <= p_dikirim_pada);

  if p_arah = 'masuk' then
    -- Menunggu balasan sejak pesan masuk paling awal yang belum dibalas.
    -- Riwayat lama (> 7 hari) diabaikan supaya inbox tidak langsung merah.
    if not (p_dari_history and p_dikirim_pada < now() - interval '7 days') then
      update public.contacts
      set menunggu_balasan_sejak = p_dikirim_pada
      where id = v_contact.id
        and (menunggu_balasan_sejak is null or menunggu_balasan_sejak > p_dikirim_pada)
        and not exists (
          select 1 from public.messages m
          where m.contact_id = v_contact.id and m.arah = 'keluar' and m.dikirim_pada >= p_dikirim_pada
        );
    end if;

    -- Kontak yang sudah Closing/Lost lalu chat lagi dibuka ulang ke stage awal.
    if not p_dari_history and v_contact.stage_id is not null then
      select tipe into v_stage_tipe from public.stages where id = v_contact.stage_id;
      if v_stage_tipe in ('closing', 'lost') then
        update public.contacts set stage_id = v_stage_baru where id = v_contact.id;
      end if;
    end if;
  else
    update public.contacts
    set menunggu_balasan_sejak = null
    where id = v_contact.id and menunggu_balasan_sejak <= p_dikirim_pada;
  end if;

  return 'inserted';
end;
$$;

revoke execute on function public.ingest_message(text, text, public.arah_pesan, text, text, text, text, text, text, text, jsonb, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.ingest_message(text, text, public.arah_pesan, text, text, text, text, text, text, text, jsonb, timestamptz, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- Hak akses kolom
-- ---------------------------------------------------------------------------

revoke all on public.wa_numbers, public.contacts, public.messages, public.stage_history from anon;

revoke insert, update, delete on public.wa_numbers from authenticated;
grant update (label, cs_pemilik) on public.wa_numbers to authenticated;

-- Kontak dan pesan dibuat sistem; user hanya mengubah nama, assign, dan stage.
revoke insert, update, delete on public.contacts from authenticated;
grant update (nama, assigned_to, stage_id) on public.contacts to authenticated;

revoke insert, update, delete on public.messages, public.stage_history from authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.wa_numbers enable row level security;
alter table public.contacts enable row level security;
alter table public.messages enable row level security;
alter table public.stage_history enable row level security;

create policy "anggota melihat nomor WA" on public.wa_numbers
  for select to authenticated
  using (public.is_member(workspace_id) or public.is_super_admin());

create policy "super admin menambah nomor WA" on public.wa_numbers
  for insert to authenticated
  with check (public.is_super_admin());

create policy "owner mengubah nomor WA" on public.wa_numbers
  for update to authenticated
  using (public.role_in(workspace_id) = 'owner' or public.is_super_admin())
  with check (public.role_in(workspace_id) = 'owner' or public.is_super_admin());

create policy "super admin menghapus nomor WA" on public.wa_numbers
  for delete to authenticated
  using (public.is_super_admin());

create policy "melihat kontak sesuai peran" on public.contacts
  for select to authenticated
  using (public.can_view_contact(workspace_id, assigned_to));

-- CS hanya bisa mengubah kontak miliknya dan tidak bisa melemparnya ke orang lain.
create policy "mengubah kontak sesuai peran" on public.contacts
  for update to authenticated
  using (public.can_view_contact(workspace_id, assigned_to))
  with check (
    public.is_super_admin()
    or public.role_in(workspace_id) in ('owner', 'supervisor')
    or (public.role_in(workspace_id) = 'cs' and assigned_to = (select auth.uid()))
  );

create policy "melihat pesan dari kontak yang terlihat" on public.messages
  for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id));

create policy "melihat riwayat stage dari kontak yang terlihat" on public.stage_history
  for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id));

-- ---------------------------------------------------------------------------
-- Realtime untuk inbox (RLS tetap berlaku pada Realtime)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.contacts, public.messages;
