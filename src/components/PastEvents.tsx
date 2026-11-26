import { AccountEventCard } from "@/components/AccountEventCard";
import { ProfileHistory } from "@/components/ProfileHistory";
import { historyLabels } from "@/components/RoperHistorySection";
import { getRoperHistory } from "@/lib/data/ropers";
import type { MyRegistration } from "@/lib/data/registrations";
import { toHistoryItem } from "@/lib/results-view";
import { pastWithoutResults } from "@/lib/upcoming";
import type { Lang } from "@/lib/format";
import type { Dict } from "@/dictionaries/es";

// KIN-770: «Eventos pasados» de Mi cuenta en una sola lista: primero los que aún no tienen resultados y luego los resultados. El pago solo se
// menciona cuando no quedó pagado.
export async function PastEvents({ id, registrations, lang, t }: { id: string; registrations: MyRegistration[]; lang: Lang; t: Dict }) {
  const page = await getRoperHistory(id);
  const waiting = pastWithoutResults(registrations, page.rows.map((r) => ({ slug: r.eventSlug, date: r.date })), page.next !== null);
  const paymentNote = (status: string) => (status === "pendiente" ? t.account.pending : status === "reembolsado" ? t.account.refunded : null);
  const notes: Record<string, string> = {};
  for (const m of registrations) {
    const note = paymentNote(m.paymentStatus);
    if (m.event?.slug && note) notes[`/${lang}/eventos/${m.event.slug}`] = note;
  }
  if (waiting.length === 0 && page.rows.length === 0) return <p className="mt-3 text-muted">{t.account.noPast}</p>;
  return (
    <>
      {waiting.length > 0 && (
        <div className="mt-3 space-y-3">
          {waiting.map((m) => (
            <AccountEventCard key={m.id} date={m.event?.date} lang={lang} name={m.event?.name ?? "—"} href={m.event?.slug ? `/${lang}/eventos/${m.event.slug}` : undefined}
              meta={[m.role ? t.roles[m.role as "header" | "heeler"] : "", m.category].filter(Boolean).join(" · ")} menuLabel={t.account.moreOptions}
              status={<span className="inline-block rounded-full bg-sand px-2.5 py-1 text-xs font-medium text-muted">{paymentNote(m.paymentStatus) ?? `✓ ${t.account.paid}`}</span>} />
          ))}
        </div>
      )}
      {page.rows.length > 0 && (
        <ProfileHistory roperId={id} lang={lang} initial={page.rows.map((r) => toHistoryItem(r, lang, t))} next={page.next} notes={notes} labels={historyLabels(t)} />
      )}
    </>
  );
}
