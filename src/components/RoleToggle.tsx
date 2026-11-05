import Link from "next/link";

// Selector Organizador / Participante (en la URL como ?role=…, así funciona sin JavaScript y se puede enlazar).
export function RoleToggle({ href, role, labels }: { href: (r: "organizador" | "participante") => string; role: "organizador" | "participante"; labels: { organizador: string; participante: string } }) {
  return (
    <div role="tablist" className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-sand p-1 text-center text-sm font-medium">
      {(["organizador", "participante"] as const).map((r) => (
        <Link key={r} href={href(r)} replace role="tab" aria-selected={role === r} scroll={false}
          className={`rounded-full py-2 ${role === r ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{labels[r]}</Link>
      ))}
    </div>
  );
}
