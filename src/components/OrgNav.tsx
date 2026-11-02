import Link from "next/link";

const items = [
  ["/organizador", "Resumen"],
  ["/organizador/participantes", "Participantes"],
  ["/organizador/app", "Conexión con la app"],
];

export function OrgNav() {
  return (
    <nav>
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 pt-2 text-[0.75rem] font-bold uppercase tracking-[0.14em]">
        {items.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap rounded-full px-4 py-2 text-muted hover:bg-card hover:text-brand-hot">{label}</Link>)}
        <Link href="/" className="ml-auto whitespace-nowrap rounded-full px-4 py-2 text-muted hover:bg-card hover:text-brand-hot">Ver sitio público ↗</Link>
      </div>
    </nav>
  );
}
