import "server-only";
import { cache } from "react";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Lookup } from "@/components/inbox/types";

// Data pendukung inbox per workspace: nama stage, label nomor WA, nama anggota.
export const getInboxLookups = cache(async (slug: string) => {
  const access = await requireWorkspace(slug);
  const supabase = await createClient();
  const wsId = access.workspace.id;

  const [stages, numbers, members] = await Promise.all([
    supabase.from("stages").select("id, nama").eq("workspace_id", wsId),
    supabase.from("wa_numbers").select("id, label").eq("workspace_id", wsId),
    // CS hanya melihat keanggotaannya sendiri (RLS); profil rekan tetap terbaca.
    supabase.from("profiles").select("id, nama, email"),
  ]);

  const toLookup = (rows: { id: string; label: string }[] | null): Lookup =>
    Object.fromEntries((rows ?? []).map((r) => [r.id, r.label]));

  return {
    access,
    stages: toLookup(stages.data?.map((s) => ({ id: s.id, label: s.nama })) ?? null),
    numbers: toLookup(numbers.data),
    people: toLookup(members.data?.map((p) => ({ id: p.id, label: p.nama ?? p.email })) ?? null),
    thresholds: { kuning: access.workspace.batas_kuning_menit, merah: access.workspace.batas_merah_menit },
  };
});
