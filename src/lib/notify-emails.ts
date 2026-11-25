// Textos de los correos de aviso al participante (KIN-657 y KIN-660). Puro: sin red ni base, para poder probarlo.
export type Lang2 = "es" | "en";
export type NoticeKind = "removed" | "event_deleted" | "promoted";
export type NoticeData = {
  kind: NoticeKind; lang: Lang2; name: string; eventName: string; eventDate: string | null; place: string; organizer: string; contact: string | null;
  reason: string; paid: boolean;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (d: string, lang: Lang2) => new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

const T = {
  es: {
    removed: { subject: (e: string) => `Te sacaron del evento ${e}`, lead: (e: string) => `El organizador te sacó del evento «${e}».` },
    event_deleted: { subject: (e: string) => `Se canceló el evento ${e}`, lead: (e: string) => `El organizador borró el evento «${e}», así que tu inscripción ya no aplica.` },
    promoted: { subject: (e: string) => `Ya estás inscrito en ${e}`, lead: (e: string) => `Se abrió un lugar en «${e}» y el organizador te pasó de la lista de espera a inscrito.` },
    promotedPay: "Tu inscripción queda pendiente de pago: en Mi cuenta ves cuánto es y cómo pagar.",
    hi: (n: string) => `Hola ${n},`, event: "Evento", date: "Fecha", place: "Lugar", by: "Organiza", reason: "Motivo",
    paid: "Tu pago ya estaba registrado. No hay reembolso automático: ponte en contacto con el organizador para que te lo devuelva.",
    contact: (c: string) => `Si tienes dudas, escribe al organizador: ${c}.`, noContact: "Si tienes dudas, contacta al organizador desde la página del evento.",
  },
  en: {
    removed: { subject: (e: string) => `You were removed from ${e}`, lead: (e: string) => `The organizer removed you from “${e}”.` },
    event_deleted: { subject: (e: string) => `${e} was canceled`, lead: (e: string) => `The organizer deleted “${e}”, so your registration no longer applies.` },
    promoted: { subject: (e: string) => `You are now registered for ${e}`, lead: (e: string) => `A spot opened up in “${e}” and the organizer moved you from the waitlist to registered.` },
    promotedPay: "Your registration is pending payment: in My account you can see the amount and how to pay.",
    hi: (n: string) => `Hi ${n},`, event: "Event", date: "Date", place: "Place", by: "Organizer", reason: "Reason",
    paid: "Your payment was already recorded. There is no automatic refund: please contact the organizer to get it back.",
    contact: (c: string) => `If you have questions, write to the organizer: ${c}.`, noContact: "If you have questions, contact the organizer from the event page.",
  },
} as const;

/** Asunto, texto y HTML del aviso. El motivo lo escribió el organizador: en el HTML siempre va escapado. */
export function buildNoticeEmail(d: NoticeData): { subject: string; text: string; html: string } {
  const t = T[d.lang];
  const k = t[d.kind];
  const rows: [string, string][] = [[t.event, d.eventName]];
  if (d.eventDate) rows.push([t.date, fmt(d.eventDate, d.lang)]);
  if (d.place) rows.push([t.place, d.place]);
  if (d.organizer) rows.push([t.by, d.organizer]);
  if (d.kind !== "promoted") rows.push([t.reason, d.reason]);
  const tail = [d.kind === "promoted" ? t.promotedPay : null, d.paid ? t.paid : null, d.contact ? t.contact(d.contact) : t.noContact].filter((x): x is string => !!x);
  const text = [t.hi(d.name), "", k.lead(d.eventName), "", ...rows.map(([a, b]) => `${a}: ${b}`), "", ...tail].join("\n");
  const html = `<p>${esc(t.hi(d.name))}</p><p>${esc(k.lead(d.eventName))}</p><ul>${rows.map(([a, b]) => `<li><strong>${esc(a)}:</strong> ${esc(b)}</li>`).join("")}</ul>${tail.map((x) => `<p>${esc(x)}</p>`).join("")}`;
  return { subject: k.subject(d.eventName), text, html };
}
