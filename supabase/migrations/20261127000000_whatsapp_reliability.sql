-- Jalur 1 (keandalan data WhatsApp): ingest berkelompok, pesan diedit/ditarik,
-- status nomor, statistik webhook untuk /admin.
--
-- Migrasi ini ADITIF: project Supabase dipakai produksi yang berjalan dengan
-- kode lama, jadi ingest_message (signature dan isi) tidak diubah, kolom baru
-- semuanya nullable, dan hanya fungsi baru yang ditambahkan.

-- ---------------------------------------------------------------------------
-- Kolom baru
-- ---------------------------------------------------------------------------

-- Pesan yang diedit / ditarik ("hapus untuk semua") oleh pengirimnya.
alter table public.messages
  add column if not exists diedit_pada timestamptz,
  add column if not exists dihapus_pada timestamptz;

-- Alasan nomor berstatus terputus (event account_update dari Meta).
alter table public.wa_numbers
  add column if not exists status_alasan text,
  add column if not exists status_berubah_pada timestamptz;

-- Balasan CS terakhir dari aplikasi (bukan riwayat) per nomor, untuk
-- peringatan 14 hari Coexistence di /admin.
create index if not exists messages_wa_number_balasan_idx
  on public.messages (wa_number_id, dikirim_pada desc)
  where arah = 'keluar' and not dari_history;

-- Retensi webhook_events (cron harian menghapus yang sudah diproses > 90 hari).
create index if not exists webhook_events_diterima_idx on public.webhook_events (diterima_pada);

-- ---------------------------------------------------------------------------
-- Ingest berkelompok
-- ---------------------------------------------------------------------------
-- Satu panggilan, satu transaksi, untuk banyak pesan (riwayat chat bisa
-- ratusan pesan per webhook). Setiap elemen p_messages:
--
--   pesan : { "kind": "message", "phone_number_id", "wa_message_id", "arah",
--             "customer_phone", "customer_name", "tipe", "isi", "media_id",
--             "media_mime", "nama_file", "referral", "dikirim_pada",
--             "dari_history" }
--   edit  : { "kind": "edit", "phone_number_id", "original_wa_message_id",
--             "isi", "pada" }
--   tarik : { "kind": "revoke", "phone_number_id", "original_wa_message_id",
--             "pada" }
--
-- Pesan diproses dengan ingest_message yang sama persis (logika tidak
-- diduplikasi), diurutkan per nomor → kontak → waktu supaya urutan kunci baris
-- konsisten antar-transaksi dan hasilnya tidak bergantung urutan input. Edit
-- dan tarik diproses setelah semua pesan, supaya edit untuk pesan dalam batch
-- yang sama tetap menemukan pesan aslinya.
--
-- Mengembalikan { inserted, duplicate, unknown_phone_number_ids[], edited,
-- revoked, missing } (missing = edit/tarik yang pesan aslinya tidak ada).

create function public.ingest_messages(p_messages jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_outcome text;
  v_inserted integer := 0;
  v_duplicate integer := 0;
  v_edited integer := 0;
  v_revoked integer := 0;
  v_missing integer := 0;
  v_unknown text[] := '{}';
  v_number_id uuid;
  v_message public.messages;
  v_pada timestamptz;
begin
  if p_messages is null or jsonb_typeof(p_messages) <> 'array' then
    raise exception 'p_messages harus berupa array JSON';
  end if;

  for v_item in
    select e
    from jsonb_array_elements(p_messages) as e
    where coalesce(e ->> 'kind', 'message') = 'message'
    order by e ->> 'phone_number_id', e ->> 'customer_phone', (e ->> 'dikirim_pada')::timestamptz, e ->> 'wa_message_id'
  loop
    v_outcome := public.ingest_message(
      v_item ->> 'phone_number_id',
      v_item ->> 'wa_message_id',
      (v_item ->> 'arah')::public.arah_pesan,
      v_item ->> 'customer_phone',
      v_item ->> 'customer_name',
      v_item ->> 'tipe',
      v_item ->> 'isi',
      v_item ->> 'media_id',
      v_item ->> 'media_mime',
      v_item ->> 'nama_file',
      case when jsonb_typeof(v_item -> 'referral') = 'object' then v_item -> 'referral' end,
      (v_item ->> 'dikirim_pada')::timestamptz,
      coalesce((v_item ->> 'dari_history')::boolean, false)
    );
    if v_outcome = 'inserted' then
      v_inserted := v_inserted + 1;
    elsif v_outcome = 'duplicate' then
      v_duplicate := v_duplicate + 1;
    elsif not (v_item ->> 'phone_number_id' = any (v_unknown)) then
      v_unknown := v_unknown || (v_item ->> 'phone_number_id');
    end if;
  end loop;

  for v_item in
    select e
    from jsonb_array_elements(p_messages) as e
    where e ->> 'kind' in ('edit', 'revoke')
    order by coalesce((e ->> 'pada')::timestamptz, now())
  loop
    select id into v_number_id from public.wa_numbers where phone_number_id = v_item ->> 'phone_number_id';
    if v_number_id is null then
      if not (v_item ->> 'phone_number_id' = any (v_unknown)) then
        v_unknown := v_unknown || (v_item ->> 'phone_number_id');
      end if;
      continue;
    end if;

    v_pada := coalesce((v_item ->> 'pada')::timestamptz, now());

    select * into v_message
    from public.messages
    where wa_message_id = v_item ->> 'original_wa_message_id' and wa_number_id = v_number_id;
    if not found then
      v_missing := v_missing + 1;
      continue;
    end if;

    if v_item ->> 'kind' = 'edit' then
      -- Edit yang lebih lama dari edit terakhir (datang tidak berurutan)
      -- diabaikan; pesan yang sudah ditarik tidak bisa diedit.
      update public.messages
      set isi = v_item ->> 'isi', diedit_pada = v_pada
      where id = v_message.id
        and dihapus_pada is null
        and (diedit_pada is null or diedit_pada <= v_pada);
      if found then
        v_edited := v_edited + 1;
        update public.contacts
        set pesan_terakhir_cuplikan = left(coalesce(nullif(trim(v_item ->> 'isi'), ''), pesan_terakhir_cuplikan), 140)
        where id = v_message.contact_id and pesan_terakhir_pada = v_message.dikirim_pada;
      end if;
    else
      -- Isi tetap disimpan (jejak CRM); Inbox menampilkan "Pesan dihapus".
      update public.messages
      set dihapus_pada = v_pada
      where id = v_message.id and dihapus_pada is null;
      if found then
        v_revoked := v_revoked + 1;
        update public.contacts
        set pesan_terakhir_cuplikan = 'Pesan dihapus'
        where id = v_message.contact_id and pesan_terakhir_pada = v_message.dikirim_pada;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'duplicate', v_duplicate,
    'unknown_phone_number_ids', to_jsonb(v_unknown),
    'edited', v_edited,
    'revoked', v_revoked,
    'missing', v_missing
  );
end;
$$;

revoke execute on function public.ingest_messages(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_messages(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Statistik webhook per sumber untuk halaman pemantauan /admin
-- ---------------------------------------------------------------------------
-- tertunda = belum diproses tanpa error (sedang/akan diproses after(), atau
-- terhenti karena batas waktu); gagal = belum diproses dengan error (termasuk
-- "nomor belum terdaftar"). Hanya dipanggil server (secret key) setelah
-- requireSuperAdmin.

create function public.webhook_event_stats()
returns table (
  sumber text,
  total bigint,
  tertunda bigint,
  gagal bigint,
  tertunda_terlama timestamptz,
  diterima_terakhir timestamptz,
  error_terakhir text,
  error_terakhir_pada timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.sumber,
    count(*) as total,
    count(*) filter (where not w.diproses and w.error is null) as tertunda,
    count(*) filter (where not w.diproses and w.error is not null) as gagal,
    min(w.diterima_pada) filter (where not w.diproses) as tertunda_terlama,
    max(w.diterima_pada) as diterima_terakhir,
    (array_agg(w.error order by w.diterima_pada desc) filter (where not w.diproses and w.error is not null))[1] as error_terakhir,
    max(w.diterima_pada) filter (where not w.diproses and w.error is not null) as error_terakhir_pada
  from public.webhook_events w
  group by w.sumber
  order by w.sumber;
$$;

revoke execute on function public.webhook_event_stats() from public, anon, authenticated;
grant execute on function public.webhook_event_stats() to service_role;
