import Link from "next/link";

const items = [
  ["/organizador", "Resumen"],
  ["/organizador/participantes", "Participantes"],
  ["/organizador/app", "Conexión con la app"],
];

export function OrgNav() {
  return (
    <nav className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 text-sm font-semibold">
        {items.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap px-3 py-3 text-muted hover:text-brand-hot">{label}</Link>)}
        <Link href="/" className="ml-auto whitespace-nowrap px-3 py-3 text-muted hover:text-brand-hot">Ver sitio público ↗</Link>
      </div>
    </nav>
  );
}
