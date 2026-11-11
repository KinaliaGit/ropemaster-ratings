import Image from "next/image";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";
import { productUrl, licensesUrl } from "@/lib/links";

// Presentación breve del software, con salida a la página de Rope Master para conocerlo o comprar una licencia.
export function RopeMasterPromo({ lang, t }: { lang: Lang; t: Dict }) {
  const p = t.promo;
  return (
    <section aria-labelledby="promo-title" className="relative mt-20 overflow-hidden rounded-[28px] bg-ink px-6 py-10 text-white sm:px-12 sm:py-14">
      <Image src="/hero-roping.png" alt="" width={560} height={916} sizes="300px" className="pointer-events-none absolute -right-10 -top-6 hidden h-[130%] w-auto opacity-[0.07] brightness-0 invert lg:block" />
      <div className="relative max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-medium text-white/70">
          <Image src="/logo.png" alt="" width={24} height={24} className="size-6" />{p.label}
        </p>
        <h2 id="promo-title" className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">{p.title}</h2>
        <p className="mt-4 text-lg text-white/75">{p.text}</p>
      </div>
      <ul className="relative mt-10 grid gap-6 sm:grid-cols-3">
        {p.points.map((x) => (
          <li key={x.title} className="border-t border-white/15 pt-4">
            <p className="font-semibold">{x.title}</p>
            <p className="mt-1 text-sm text-white/65">{x.text}</p>
          </li>
        ))}
      </ul>
      <div className="relative mt-10 flex flex-wrap items-center gap-3">
        <a href={productUrl(lang)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-hot">{p.learn} ↗</a>
        <a href={licensesUrl(lang)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/30 px-6 py-3 text-sm font-medium transition hover:border-white">{p.licenses}</a>
        <span className="text-sm text-white/55">{p.sync}</span>
      </div>
    </section>
  );
}
