import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";

export default function WorkspaceLayout({
  children,
}: LayoutProps<"/w/[slug]">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense>
        <AppSidebar />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
