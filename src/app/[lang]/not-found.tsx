import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

// KIN-624: una ruta que no existe (o un evento/perfil borrado) muestra una página amable con el botón de regreso, nunca una pantalla en blanco.
// Esta página no recibe el idioma: se muestran los dos.
export default function NotFound() {
  const es = getDictionary("es").account;
  const en = getDictionary("en").account;
  return (
    <div className="page-narrow text-center">
      <p className="label">404</p>
      <h1 className="mt-2 text-3xl font-semibold">{es.notFoundTitle}</h1>
      <p className="mt-2 text-muted">{es.notFoundText}</p>
      <p className="mt-6 text-sm text-muted">{en.notFoundTitle}. {en.notFoundText}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/es" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{es.notFoundBack}</Link>
        <Link href="/en" className="rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:border-ink">{en.notFoundBack}</Link>
      </div>
    </div>
  );
}
