import Link from "next/link";
import { dateBlock } from "@/lib/upcoming";
import type { Lang } from "@/lib/format";
import { CardMenu } from "@/components/CardMenu";

// KIN-770: un próximo evento de «Mi cuenta», para leerlo de un vistazo: fecha a la izquierda, nombre, estado y, en «⋯», las acciones poco
// frecuentes. El «⋯» es un <details> (CardMenu) que flota debajo del botón sin mover el resto de la tarjeta.
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
          <p className={`break-words font-medium ${menu ? "pr-11" : ""}`}>{href ? <Link href={href} className="-my-1.5 inline-block py-1.5 hover:text-brand-hot">{name}</Link> : name}</p>
          <p className={`break-words text-sm text-muted ${menu ? "pr-11" : ""}`}>{meta}</p>
          {menu && <CardMenu label={`${menuLabel}: ${name}`}>{menu}</CardMenu>}
        </div>
        <div className="mt-2">{status}</div>
        {children}
      </div>
    </div>
  );
}
