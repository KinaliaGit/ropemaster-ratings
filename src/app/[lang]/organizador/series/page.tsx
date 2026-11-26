import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { parseArenaParam } from "@/lib/arena";
import { resolveLang } from "@/lib/i18n";

// La lista de series vive en la pestaña «Series» del panel (KIN-761). Esta dirección se conserva para enlaces guardados; el panel revisa el permiso.
async function Page({ props }: { props: PageProps<"/[lang]/organizador/series"> }): Promise<never> {
  const lang = await resolveLang(props.params);
  const arena = parseArenaParam((await props.searchParams).arena);
  redirect(`/${lang}/organizador?${new URLSearchParams({ ver: "series", ...(arena ? { arena } : {}) })}`);
}

export default function SeriesPage(props: PageProps<"/[lang]/organizador/series">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
