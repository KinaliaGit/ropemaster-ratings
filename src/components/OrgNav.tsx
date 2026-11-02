import Link from "next/link";

const items = [
  ["/organizador", "Resumen"],
  ["/organizador/participantes", "Participantes"],
  ["/organizador/app", "App local"],
];

export function OrgNav() {
  return (
    <nav className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-5 pt-6 text-sm font-medium">
      {items.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap text-muted transition hover:text-ink">{label}</Link>)}
      <Link href="/" className="ml-auto whitespace-nowrap text-muted transition hover:text-ink">Sitio público ↗</Link>
    </nav>
  );
}
