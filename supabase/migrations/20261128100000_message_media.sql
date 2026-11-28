-- Jalur 2 (media chat): status unduhan media, bucket Storage privat `media`,
-- dan pelengkap detail media untuk pesan riwayat (media_placeholder).
--
-- Migrasi ini ADITIF: kolom baru nullable (atau ber-default), fungsi baru, dan
-- policy baru. ingest_message / ingest_messages tidak diubah; kode lama tetap
-- berjalan seperti sebelumnya.

-- ---------------------------------------------------------------------------
-- Kolom baru di messages (media_id, media_mime, media_path, nama_file sudah ada)
-- ---------------------------------------------------------------------------
-- media_status:
--   null / 'menunggu' = belum dicoba
--   'tersimpan'       = file ada di Storage (media_path terisi)
--   'gagal'           = gagal sementara, dicoba lagi oleh cron harian
--   'tidak_tersedia'  = final: media id kedaluwarsa, ditolak Meta, atau terlalu besar

alter table public.messages
  add column if not exists media_status text
    check (media_status in ('menunggu', 'tersimpan', 'gagal', 'tidak_tersedia')),
  add column if not exists media_size bigint,
  add column if not exists media_percobaan smallint not null default 0,
  add column if not exists media_error text,
  add column if not exists media_diunduh_pada timestamptz;

-- Antrean unduhan: pesan dengan media id tetapi belum tersimpan.
create index if not exists messages_media_pending_idx
  on public.messages (dibuat_pada)
  where media_id is not null and media_path is null;

-- Policy Storage mencari pesan berdasarkan path file.
create index if not exists messages_media_path_idx
  on public.messages (media_path)
  where media_path is not null;

-- ---------------------------------------------------------------------------
-- Bucket privat. Path file: <workspace_id>/<message_id>.<ext>
-- ---------------------------------------------------------------------------
-- Batas ukuran mengikuti batas global project (paket gratis 50 MB); file yang
-- lebih besar ditandai tidak_tersedia oleh pengunduh.

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Hanya baca. Upload/hapus hanya lewat secret key (service_role melewati RLS).
-- File boleh dibaca jika pesan pemiliknya terlihat oleh user: sama dengan
-- hak lihat pesan (Owner/Supervisor semua kontak, CS hanya kontak miliknya),
-- dan folder pertama path harus workspace pesan tersebut.
create policy "melihat media dari pesan yang terlihat" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1
      from public.messages m
      join public.contacts c on c.id = m.contact_id
      where m.media_path = storage.objects.name
        and m.workspace_id::text = (storage.foldername(storage.objects.name))[1]
        and public.can_view_contact(c.workspace_id, c.assigned_to)
    )
  );

-- ---------------------------------------------------------------------------
-- Detail media yang menyusul untuk pesan yang sudah ada
-- ---------------------------------------------------------------------------
-- Riwayat chat Coexistence mengirim pesan media sebagai `media_placeholder`
-- tanpa media id; detailnya datang belakangan dengan wa_message_id yang sama.
-- ingest_messages menganggapnya duplikat, jadi fungsi ini melengkapi baris
-- yang belum punya media id. Input: [{"wa_message_id", "tipe", "media_id",
-- "media_mime", "nama_file", "isi"}]. Mengembalikan jumlah baris yang berubah.

create or replace function public.attach_media_details(p_items jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with items as (
    select *
    from jsonb_to_recordset(p_items) as x(
      wa_message_id text, tipe text, media_id text, media_mime text, nama_file text, isi text
    )
    where x.media_id is not null
  ),
  updated as (
    update public.messages m
    set
      tipe = coalesce(i.tipe, m.tipe),
      media_id = i.media_id,
      media_mime = coalesce(i.media_mime, m.media_mime),
      nama_file = coalesce(i.nama_file, m.nama_file),
      isi = coalesce(m.isi, i.isi),
      media_status = null,
      media_percobaan = 0,
      media_error = null
    from items i
    where m.wa_message_id = i.wa_message_id
      and m.media_id is null
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke execute on function public.attach_media_details(jsonb) from public, anon, authenticated;
grant execute on function public.attach_media_details(jsonb) to service_role;
