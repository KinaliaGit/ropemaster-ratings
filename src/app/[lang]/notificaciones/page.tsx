import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { listMyNotifications } from "@/lib/data/notifications";
import { markNotificationsRead } from "@/lib/notification-actions";
import { fmtDate } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/notificaciones"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const n = t.notifications;
  return (
    <Gate lang={lang} role="any" next={`/${lang}/notificaciones`}>
      {async () => {
        const items = await listMyNotifications();
        const unread = items.filter((i) => !i.read).length;
        return (
          <div className="page">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-3xl font-semibold">{n.title}</h1>
              {unread > 0 && (
                <form action={markNotificationsRead}>
                  <input type="hidden" name="lang" value={lang} />
                  <button className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">{n.markAll}</button>
                </form>
              )}
            </div>
            <div className="mt-6 grid items-start gap-3 md:grid-cols-2 [&>:only-child]:col-span-full">
              {items.length === 0 && <p className="rounded-2xl bg-sand p-6 text-center text-muted md:col-span-2">{n.empty}</p>}
              {items.map((i) => (
                <article key={i.id} className={`card p-4 ${i.read ? "" : "border-brand"}`} aria-label={i.eventName}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="min-w-0 break-words font-semibold">{i.kind === "removed" ? n.removedTitle(i.eventName) : i.kind === "promoted" ? n.promotedTitle(i.eventName) : n.deletedTitle(i.eventName)}</h2>
                    {!i.read && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-hot">{n.new}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{fmtDate(i.createdAt.slice(0, 10), lang)}{i.eventDate ? ` · ${n.eventOn} ${fmtDate(i.eventDate, lang)}` : ""}</p>
                  {i.kind === "promoted"
                    ? <p className="mt-2 text-sm">{n.promotedText}</p>
                    : <p className="mt-2 text-sm"><span className="font-medium">{n.reason}</span> <span className="whitespace-pre-line break-words">{i.reason}</span></p>}
                  {i.refundPending && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{n.refund}</p>}
                  {!i.read && (
                    <form action={markNotificationsRead} className="mt-3">
                      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={i.id} />
                      <button className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">{n.markRead}</button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </div>
        );
      }}
    </Gate>
  );
}

export default function Notificaciones(props: PageProps<"/[lang]/notificaciones">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
