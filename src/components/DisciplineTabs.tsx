import Link from "next/link";
import { ACTIVE_DISCIPLINES, type DisciplineId } from "@/lib/disciplines";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

// Selector de modalidad. No se muestra mientras solo haya una activa.
export function DisciplineTabs({ current, base, lang, t }: { current: DisciplineId; base: string; lang: Lang; t: Dict }) {
  if (ACTIVE_DISCIPLINES.length < 2) return null;
  return (
    <div className="mt-6 flex gap-2">
      {ACTIVE_DISCIPLINES.map((d) => (
        <Link key={d.id} href={`/${lang}${base}?disciplina=${d.id}`} className={`rounded-full px-4 py-1.5 text-sm font-medium ${d.id === current ? "bg-ink text-white" : "bg-sand text-muted hover:text-ink"}`}>{t.disc[d.id].persons}</Link>
      ))}
    </div>
  );
}
