import "server-only";
import { cache } from "react";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Lookup } from "@/components/inbox/types";

// Data pendukung inbox per workspace: nama stage, label nomor WA, nama anggota,
// nama iklan (dari Meta, cadangan headline referral; terbaca juga oleh CS).
export const getInboxLookups = cache(async (slug: string) => {
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const wsId = access.workspace.id;

  const [stages, numbers, members, ads] = await Promise.all([
    supabase.from("stages").select("id, nama").eq("workspace_id", wsId).order("urutan"),
    supabase.from("wa_numbers").select("id, label").eq("workspace_id", wsId),
    // CS hanya melihat keanggotaannya sendiri (RLS); profil rekan tetap terbaca.
    supabase.from("profiles").select("id, nama, email"),
    supabase.rpc("workspace_ad_names", { ws: wsId }),
  ]);
  // Fungsi nama iklan bisa belum ada (migrasi belum diterapkan): cukup kosong.
  const adRows = (ads.error ? [] : (ads.data ?? [])) as { meta_ad_id: string; nama: string | null }[];

  const toLookup = (rows: { id: string; label: string }[] | null): Lookup =>
    Object.fromEntries((rows ?? []).map((r) => [r.id, r.label]));

  return {
    access,
    stages: toLookup(stages.data?.map((s) => ({ id: s.id, label: s.nama })) ?? null),
    numbers: toLookup(numbers.data),
    people: toLookup(members.data?.map((p) => ({ id: p.id, label: p.nama ?? p.email })) ?? null),
    adNames: toLookup(adRows.filter((a) => a.nama).map((a) => ({ id: a.meta_ad_id, label: a.nama! }))),
    adIds: adRows.map((a) => a.meta_ad_id),
    thresholds: { kuning: access.workspace.batas_kuning_menit, merah: access.workspace.batas_merah_menit },
  };
});
