export const PERAN = ["owner", "supervisor", "cs"] as const;
export type Peran = (typeof PERAN)[number];

export const PERAN_LABEL: Record<Peran, string> = {
  owner: "Owner",
  supervisor: "Supervisor",
  cs: "CS",
};

export type Workspace = {
  id: string;
  nama: string;
  slug: string;
  batas_kuning_menit: number;
  batas_merah_menit: number;
};
