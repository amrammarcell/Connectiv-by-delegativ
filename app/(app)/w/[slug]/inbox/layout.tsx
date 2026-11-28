import { Suspense } from "react";
import { InboxHeader } from "@/components/inbox/inbox-header";
import { InboxList, type InboxRow, type InboxSummary } from "@/components/inbox/inbox-list";
import { INBOX_PAGE_SIZE } from "@/components/inbox/types";
import { InboxShellSkeleton } from "@/components/states";
import { EMPTY_FILTERS, inboxRpcArgs } from "@/lib/inbox-filters";
import { getInboxLookups } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import { getMembers, getStages } from "@/lib/workspace-data";

export default function InboxLayout({ children, params }: LayoutProps<"/w/[slug]/inbox">) {
  return (
    <>
      <InboxHeader />
      {/* HP: mengisi sisa layar di antara bar atas dan menu bawah. Laptop: setinggi layar dikurangi header. */}
      <div className="flex min-h-0 flex-1 md:h-[calc(100dvh-77px)] md:flex-none">
        <Suspense fallback={<InboxShellSkeleton />}>
          <InboxListLoader params={params} />
        </Suspense>
        {children}
      </div>
    </>
  );
}

async function InboxListLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ access, numbers, adNames, adIds, thresholds }, stages, members] = await Promise.all([
    getInboxLookups(slug),
    getStages(slug),
    getMembers(slug),
  ]);
  const supabase = await createClient();
  // Halaman pertama tanpa filter; filter dari URL dimuat oleh klien
  // (layout tidak menerima searchParams).
  const [page, summary] = await Promise.all([
    supabase.rpc("inbox_contacts", inboxRpcArgs(access.workspace.id, EMPTY_FILTERS, null, INBOX_PAGE_SIZE)),
    supabase.rpc("inbox_summary", { ws: access.workspace.id }),
  ]);
  if (page.error) throw new Error(`inbox_contacts: ${page.error.message}`);
  const s = (summary.data as InboxSummary[] | null)?.[0];
  const canFilterByCs = access.canManage || access.peran === "supervisor";

  return (
    <InboxList
      slug={slug}
      workspaceId={access.workspace.id}
      initialContacts={(page.data ?? []) as InboxRow[]}
      initialSummary={
        s ? { total: Number(s.total), menunggu: Number(s.menunggu), iklan: Number(s.iklan), belum_dibaca: Number(s.belum_dibaca) } : null
      }
      numbers={numbers}
      stages={stages.map((st) => ({ id: st.id, nama: st.nama }))}
      members={canFilterByCs ? members : []}
      adNames={adNames}
      adIds={adIds}
      thresholds={thresholds}
    />
  );
}
