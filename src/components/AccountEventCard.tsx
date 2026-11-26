import Link from "next/link";
import { dateBlock } from "@/lib/upcoming";
import type { Lang } from "@/lib/format";

// KIN-770: un próximo evento de «Mi cuenta», para leerlo de un vistazo: fecha a la izquierda, nombre, estado y, en «⋯», las acciones poco
// frecuentes. Los desplegables son <details>: funcionan sin JavaScript y con teclado.
export function AccountEventCard({ date, lang, name, href, meta, status, menu, menuLabel, testId, children }: {
  date: string | null | undefined; lang: Lang; name: string; href?: string; meta: string; status: React.ReactNode;
  menu?: React.ReactNode; menuLabel: string; testId?: string; children?: React.ReactNode;
}) {
  const d = dateBlock(date, lang);
  return (
    <div className="card flex gap-3 p-3 sm:gap-4 sm:p-4" data-testid={testId}>
      <div className="w-12 shrink-0 self-start rounded-xl bg-sand py-1.5 text-center leading-tight" aria-hidden={!d}>
        <span className="block text-lg font-semibold tabular-nums">{d?.day ?? "–"}</span>
        <span className="block text-xs text-muted">{d?.month}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative">
          <p className={`break-words font-medium ${menu ? "pr-11" : ""}`}>{href ? <Link href={href} className="hover:text-brand-hot">{name}</Link> : name}</p>
          <p className={`break-words text-sm text-muted ${menu ? "pr-11" : ""}`}>{meta}</p>
          {menu && (
            <details className="group">
              <summary aria-label={`${menuLabel}: ${name}`} className="absolute -right-1 -top-1 grid size-11 cursor-pointer list-none place-items-center rounded-full text-lg leading-none hover:bg-sand group-open:bg-sand [&::-webkit-details-marker]:hidden">⋯</summary>
              <div className="mt-2 space-y-3 rounded-xl border border-line p-3 text-sm">{menu}</div>
            </details>
          )}
        </div>
        <div className="mt-2">{status}</div>
        {children}
      </div>
    </div>
  );
}
