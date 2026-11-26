import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { DeviceRevoke } from "@/components/DeviceRevoke";
import { getDictionary, resolveLang } from "@/lib/i18n";
import { EventLinkCreate } from "@/components/EventLinkCreate";
import { EventLinkRevoke } from "@/components/EventLinkRevoke";
import { listDevices } from "@/lib/sync-tokens";
import { listEventConnections } from "@/lib/event-connections";
import { listOrganizerEvents } from "@/lib/data/events";
import { fmtDate, type Lang } from "@/lib/format";

// Equipos que entraron a la app con correo y contraseña: uno por computadora, hasta 3. Cada uno se puede revocar por separado.
async function DevicesSection({ organizer, lang }: { organizer: string; lang: Lang }) {
  const d = getDictionary(lang).org.app.devices;
  const devices = await listDevices(organizer).catch(() => []);
  const day = (iso: string) => fmtDate(iso.slice(0, 10), lang);
  return (
    <section className="card mt-8 p-6" aria-labelledby="devices-title">
      <h2 id="devices-title" className="text-lg font-semibold">{d.title}</h2>
      <p className="mt-1 text-sm text-muted">{d.blurb}</p>
      {devices.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{d.none}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {devices.map((device) => (
            <li key={device.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{device.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {d.since} {day(device.createdAt)}. {d.lastUsed}: {device.lastUsedAt ? day(device.lastUsedAt) : d.neverUsed}.{" "}
                  {device.expired ? <span className="font-medium text-red-700">{d.expired}</span> : `${d.expires} ${day(device.expiresAt)}.`}
                </p>
              </div>
              <DeviceRevoke id={device.id} l={{ revoke: d.revoke, revokeConfirm: d.revokeConfirm, revokeError: d.revokeError }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Enlaces privados por evento (KIN-783): para que otra persona conecte la app a UN evento publicado, sin tu contraseña.
async function LinksSection({ organizer, lang }: { organizer: string; lang: Lang }) {
  const d = getDictionary(lang).org.app.links;
  const [links, events] = await Promise.all([
    listEventConnections(organizer).catch(() => []),
    listOrganizerEvents(organizer).catch(() => []),
  ]);
  const published = events.filter((e) => e.status === "publicado" || e.status === "finalizado").map((e) => ({ id: e.id, name: e.name }));
  const day = (iso: string) => fmtDate(iso.slice(0, 10), lang);
  const can = (scopes: string[]) => [d.canRead, ...(scopes.includes("results:write") ? [d.canResults] : []), ...(scopes.includes("payments:write") ? [d.canPayments] : [])].join(", ");
  return (
    <section className="card mt-8 p-6" aria-labelledby="links-title">
      <h2 id="links-title" className="text-lg font-semibold">{d.title}</h2>
      <p className="mt-1 text-sm text-muted">{d.blurb}</p>
      {published.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{d.noEvents}</p>
      ) : (
        <EventLinkCreate events={published} l={{
          event: d.event, label: d.label, labelPlaceholder: d.labelPlaceholder, permissions: d.permissions, scopeRead: d.scopeRead, scopeResults: d.scopeResults,
          scopePayments: d.scopePayments, create: d.create, creating: d.creating, created: d.created, code: d.code, copy: d.copy, copied: d.copied, codeHint: d.codeHint,
          another: d.another, errors: d.errors,
        }} />
      )}
      <h3 className="mt-6 text-sm font-semibold">{d.active}</h3>
      {links.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{d.none}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {links.map((link) => (
            <li key={link.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{link.label} · {link.eventName}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {d.can}: {can(link.scopes)}.{" "}
                  {link.state === "invited"
                    ? `${d.invited} ${day(link.inviteExpiresAt)}.`
                    : `${d.connected}: ${link.deviceName ?? d.device}. ${d.lastUsed}: ${link.lastUsedAt ? day(link.lastUsedAt) : d.neverUsed}. ${d.expires} ${day(link.expiresAt ?? link.inviteExpiresAt)}.`}
                </p>
              </div>
              <EventLinkRevoke id={link.id} l={{ revoke: d.revoke, revokeConfirm: d.revokeConfirm, revokeError: d.revokeError }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Page({ params }: { params: PageProps<"/[lang]/organizador/app">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const a = t.org.app;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/app`}>
      {(s) => (
        <>
          <div className="page">
            <h1 className="text-3xl font-semibold">{a.title}</h1>
            <p className="mt-2 text-muted">{a.blurb}</p>

            <ol className="mt-8 space-y-4">
              {a.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <DevicesSection organizer={s.id} lang={lang} />
            <LinksSection organizer={s.id} lang={lang} />
          </div>
        </>
      )}
    </Gate>
  );
}

export default function ConexionApp(props: PageProps<"/[lang]/organizador/app">) {
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
