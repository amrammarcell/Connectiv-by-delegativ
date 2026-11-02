// Penanda halaman yang belum dibangun. Dihapus begitu fiturnya selesai.
export function ComingSoon({ sprint, items }: { sprint: number; items: string[] }) {
  return (
    <div className="m-7 max-w-xl rounded-xl border bg-card p-6">
      <p className="text-xs font-semibold tracking-wide text-primary uppercase">
        Sprint {sprint}
      </p>
      <p className="mt-1 text-[15px] font-semibold">Halaman ini sedang dibangun</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
