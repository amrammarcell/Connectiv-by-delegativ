import "server-only";
import { cache } from "react";
import { requireWorkspace } from "@/lib/auth";
import { cachedMembers, cachedStages, cachedWaNumbers } from "@/lib/workspace-cache";
import type { Lookup } from "@/components/inbox/types";

// Data pendukung inbox per workspace: nama stage, label nomor WA, nama anggota.
// Akses dicek dulu, lalu dibaca dari cache per workspace (lib/workspace-cache.ts).
export const getInboxLookups = cache(async (slug: string) => {
  const access = await requireWorkspace(slug);
  const wsId = access.workspace.id;

  const [stages, numbers, members] = await Promise.all([
    cachedStages(wsId),
    cachedWaNumbers(wsId),
    // Nama untuk penulis catatan/deal/riwayat: hanya anggota workspace ini
    // (dulu: semua profil yang terlihat). CS memang boleh membaca profil rekan.
    cachedMembers(wsId),
  ]);

  const toLookup = (rows: { id: string; label: string }[]): Lookup =>
    Object.fromEntries(rows.map((r) => [r.id, r.label]));

  return {
    access,
    stages: toLookup(stages.map((s) => ({ id: s.id, label: s.nama }))),
    numbers: toLookup(numbers),
    people: toLookup(members.map((m) => ({ id: m.id, label: m.nama }))),
    thresholds: { kuning: access.workspace.batas_kuning_menit, merah: access.workspace.batas_merah_menit },
  };
});
