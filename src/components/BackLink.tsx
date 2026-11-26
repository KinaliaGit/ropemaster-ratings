import Link from "next/link";

// Control para regresar, igual en toda la web: píldora con flecha y el nombre del lugar al que se vuelve.
export function BackLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`inline-flex min-h-10 max-w-full items-center gap-1 rounded-full bg-sand py-1.5 pl-2.5 pr-4 text-sm font-medium text-ink transition hover:bg-line ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
      <span className="truncate">{children}</span>
    </Link>
  );
}
