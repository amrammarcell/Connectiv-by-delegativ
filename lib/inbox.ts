import "server-only";
import { cache } from "react";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cachedMembers, cachedStages, cachedWaNumbers } from "@/lib/workspace-cache";
import type { Lookup } from "@/components/inbox/types";

// Data pendukung inbox per workspace: nama stage, label nomor WA, nama anggota,
// nama iklan (dari Meta, cadangan headline referral; terbaca juga oleh CS).
// Akses dicek dulu; stage, nomor, dan anggota dibaca dari cache per workspace
// (lib/workspace-cache.ts), nama iklan tetap lewat sesi user (berubah tiap sync).
export const getInboxLookups = cache(async (slug: string) => {
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const wsId = access.workspace.id;

  const [stages, numbers, members, ads] = await Promise.all([
    cachedStages(wsId),
    cachedWaNumbers(wsId),
    // Nama untuk penulis catatan/deal/riwayat: hanya anggota workspace ini
    // (dulu: semua profil yang terlihat). CS memang boleh membaca profil rekan.
    cachedMembers(wsId),
    supabase.rpc("workspace_ad_names", { ws: wsId }),
  ]);
  // Fungsi nama iklan bisa belum ada (migrasi belum diterapkan): cukup kosong.
  const adRows = (ads.error ? [] : (ads.data ?? [])) as { meta_ad_id: string; nama: string | null }[];

  const toLookup = (rows: { id: string; label: string }[]): Lookup =>
    Object.fromEntries(rows.map((r) => [r.id, r.label]));

  return {
    access,
    stages: toLookup(stages.map((s) => ({ id: s.id, label: s.nama }))),
    numbers: toLookup(numbers),
    people: toLookup(members.map((m) => ({ id: m.id, label: m.nama }))),
    adNames: toLookup(adRows.filter((a) => a.nama).map((a) => ({ id: a.meta_ad_id, label: a.nama! }))),
    adIds: adRows.map((a) => a.meta_ad_id),
    thresholds: { kuning: access.workspace.batas_kuning_menit, merah: access.workspace.batas_merah_menit },
  };
});
