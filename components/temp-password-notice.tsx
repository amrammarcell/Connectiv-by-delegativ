import { cn } from "@/lib/utils";

export function TempPasswordNotice({
  email,
  tempPassword,
  className,
}: {
  email: string;
  tempPassword: string | null;
  className?: string;
}) {
  if (!tempPassword) {
    return (
      <p role="status" className={cn("text-sm font-medium text-primary", className)}>
        {email} sudah punya akun dan langsung ditambahkan. Dia bisa masuk dengan password lamanya.
      </p>
    );
  }
  return (
    <div role="status" className={cn("rounded-lg border border-[#fedf89] bg-[#fffaeb] p-3 text-sm text-[#7a2e0e]", className)}>
      <p className="font-semibold">Akun {email} dibuat.</p>
      <p className="mt-1">
        Password sementara:{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px] font-semibold select-all">{tempPassword}</code>
      </p>
      <p className="mt-1">Password ini hanya ditampilkan sekali. Catat sekarang dan sampaikan langsung ke user.</p>
    </div>
  );
}
