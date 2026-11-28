import { Suspense } from "react";
import { AppSidebar, MobileBottomNav, MobileTopBar } from "@/components/app-sidebar";
import { listMyWorkspaces, requireWorkspace } from "@/lib/auth";

export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <WorkspaceShell params={params}>{children}</WorkspaceShell>
    </Suspense>
  );
}

// Di HP, shell setinggi layar: bar atas, konten yang bisa digulir, menu bawah.
// Di laptop, sidebar kiri dan halaman bergulir biasa.
const SHELL = "flex h-dvh flex-col md:h-auto md:min-h-screen md:flex-row";
const MAIN = "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:overflow-visible";

// Halaman workspace hanya dirender setelah akses user terbukti. Tanpa akses,
// requireWorkspace memanggil notFound() atau mengarahkan ke /login.
async function WorkspaceShell({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const [access, workspaces] = await Promise.all([requireWorkspace(slug), listMyWorkspaces()]);
  const props = {
    workspace: { nama: access.workspace.nama, slug: access.workspace.slug },
    workspaces,
    user: { nama: access.user.nama, email: access.user.email, isSuperAdmin: access.user.isSuperAdmin },
    peran: access.peran,
  };

  return (
    <div className={SHELL}>
      <MobileTopBar {...props} />
      <AppSidebar {...props} />
      <main className={MAIN}>{children}</main>
      <MobileBottomNav slug={access.workspace.slug} />
    </div>
  );
}

function ShellFallback() {
  return (
    <div className={SHELL}>
      <div className="h-15 shrink-0 bg-sidebar md:hidden" />
      <div className="hidden bg-sidebar md:block md:min-h-screen md:w-58" />
      <div className="flex-1" />
      <div className="h-14 shrink-0 border-t bg-card md:hidden" />
    </div>
  );
}
