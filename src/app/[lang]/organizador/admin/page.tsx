import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { setOrganizerVerified } from "@/lib/admin-actions";
import { listOrganizersForAdmin, type OrganizerRow } from "@/lib/data/directory";
import { fmtDate } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Lang } from "@/lib/format";

function Table({ rows, lang, a, verify }: { rows: OrganizerRow[]; lang: Lang; a: ReturnType<typeof getDictionary>["org"]["admin"]; verify: boolean }) {
  if (!rows.length) return <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{a.none}</p>;
  return (
    <div className="card mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-sand label"><tr><th className="p-3">{a.name}</th><th>{a.email}</th><th>{a.since}</th><th>{a.license}</th><th></th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.userId} className="border-t border-line">
              <td className="p-3 font-medium">{o.name}</td>
              <td>{o.email ?? "–"}</td>
              <td className="tabular-nums">{fmtDate(o.createdAt.slice(0, 10), lang)}</td>
              <td className="text-muted">{!o.licenseUntil ? a.noLicense : o.licenseUntil === "infinity" ? a.licenseNoExpiry : new Date(o.licenseUntil) > new Date() ? `${a.licenseUntil} ${fmtDate(o.licenseUntil.slice(0, 10), lang)}` : a.licenseExpired}</td>
              <td className="pr-3 text-right">
                <form action={setOrganizerVerified}>
                  <input type="hidden" name="lang" value={lang} /><input type="hidden" name="target" value={o.userId} /><input type="hidden" name="value" value={verify ? "true" : "false"} />
                  <button className={verify ? "rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-hot" : "rounded-full border border-line px-4 py-1.5 text-xs font-medium hover:border-ink"}>{verify ? a.verify : a.revoke}</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Page(props: PageProps<"/[lang]/organizador/admin">) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const a = t.org.admin;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/admin`}>
      {async (s) => {
        if (!s.isAdmin) redirect(`/${lang}/organizador`);
        const { organizers, audit } = await listOrganizersForAdmin();
        return (
          <>
            <OrgNav lang={lang} t={t} admin />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
              <h1 className="text-3xl font-semibold">{a.title}</h1>
              <p className="mt-1 text-sm text-muted">{a.blurb}</p>
              {sp.error === "1" && <p role="alert" className="mt-4 rounded-2xl bg-sand p-4 text-sm font-medium">{a.error}</p>}
              <h2 className="mt-8 text-xl font-semibold">{a.pending}</h2>
              <Table rows={organizers.filter((o) => !o.verified)} lang={lang} a={a} verify />
              <h2 className="mt-8 text-xl font-semibold">{a.verifiedTitle}</h2>
              <Table rows={organizers.filter((o) => o.verified)} lang={lang} a={a} verify={false} />
              <h2 className="mt-8 text-xl font-semibold">{a.audit}</h2>
              {audit.length === 0 ? <p className="mt-3 text-sm text-muted">{a.auditNone}</p> : (
                <ul className="mt-3 space-y-1 text-sm">
                  {audit.map((r) => <li key={r.id}><span className="tabular-nums text-muted">{fmtDate(r.at.slice(0, 10), lang)}</span> · {r.admin} {r.action === "verify" ? a.actionVerify : a.actionRevoke} {r.target}</li>)}
                </ul>
              )}
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function AdminPage(props: PageProps<"/[lang]/organizador/admin">) {
  return <Suspense fallback={<PageSkeleton />}><Page {...props} /></Suspense>;
}
