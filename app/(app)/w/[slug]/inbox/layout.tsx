import { Suspense } from "react";
import { Eye } from "lucide-react";
import { InboxList } from "@/components/inbox/inbox-list";
import { CONTACT_COLUMNS, type InboxContact } from "@/components/inbox/types";
import { PageHeader } from "@/components/page-header";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";

export default function InboxLayout({ children, params }: LayoutProps<"/w/[slug]/inbox">) {
  return (
    <>
      <PageHeader title="Inbox">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
          <Eye aria-hidden className="size-3.5" />
          Mirroring · hanya baca
        </span>
      </PageHeader>
      <div className="flex min-h-0 flex-1 md:h-[calc(100dvh-77px)]">
        <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Memuat percakapan…</p>}>
          <InboxListLoader params={params} />
        </Suspense>
        {children}
      </div>
    </>
  );
}

async function InboxListLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { access, numbers, thresholds } = await getInboxLookups(slug);
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("workspace_id", access.workspace.id)
    .not("pesan_terakhir_pada", "is", null)
    .order("pesan_terakhir_pada", { ascending: false })
    .limit(300)
    .returns<InboxContact[]>();

  return (
    <InboxList
      slug={slug}
      workspaceId={access.workspace.id}
      initialContacts={data ?? []}
      numbers={numbers}
      thresholds={thresholds}
    />
  );
}
