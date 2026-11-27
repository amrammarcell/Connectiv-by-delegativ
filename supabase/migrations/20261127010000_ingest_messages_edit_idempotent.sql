-- Perbaikan ingest_messages: edit yang sama (waktu dan isi sama) yang
-- diproses ulang tidak lagi dihitung sebagai "edited". Signature sama dan
-- fungsi ini belum dipakai kode produksi, jadi aman diterapkan.

create or replace function public.ingest_messages(p_messages jsonb)
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
        and (
          diedit_pada is null
          or diedit_pada < v_pada
          -- Dua edit dalam detik yang sama: yang diproses belakangan menang,
          -- tetapi edit yang sama persis tidak dihitung ulang (idempoten).
          or (diedit_pada = v_pada and isi is distinct from v_item ->> 'isi')
        );
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
