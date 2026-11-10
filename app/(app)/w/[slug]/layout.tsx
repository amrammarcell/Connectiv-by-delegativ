import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { listMyWorkspaces, requireWorkspace } from "@/lib/auth";

export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <WorkspaceShell params={params}>{children}</WorkspaceShell>
    </Suspense>
  );
}

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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        workspace={{ nama: access.workspace.nama, slug: access.workspace.slug }}
        workspaces={workspaces}
        user={{ nama: access.user.nama, email: access.user.email, isSuperAdmin: access.user.isSuperAdmin }}
        peran={access.peran}
      />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="bg-sidebar md:min-h-screen md:w-58" />
      <div className="flex-1" />
    </div>
  );
}
