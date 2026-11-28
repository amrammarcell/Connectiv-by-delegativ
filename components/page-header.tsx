export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-7 sm:py-4.5">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold tracking-tight sm:text-[22px]">{title}</h1>
        {description && (
          <p className="text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </header>
  );
}
