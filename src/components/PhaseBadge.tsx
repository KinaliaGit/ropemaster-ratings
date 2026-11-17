import type { EventPhase } from "@/lib/event-time";

const style: Record<EventPhase, string> = {
  draft: "bg-sand text-muted", upcoming: "bg-amber-100 text-amber-900", open: "bg-brand-soft text-brand-hot", full: "bg-sand text-ink", closed: "bg-sand text-muted", finished: "bg-ink text-white",
};

// Etapa de un evento de la serie: borrador, próximo, inscripciones abiertas, cupo lleno, cerradas o finalizado.
export function PhaseBadge({ phase, label }: { phase: EventPhase; label: string }) {
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style[phase]}`}>{label}</span>;
}
