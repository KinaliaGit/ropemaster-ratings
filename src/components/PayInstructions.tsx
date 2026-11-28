import { PayButton } from "@/components/PayButton";
import { mxn, type Lang } from "@/lib/format";
import type { Dict } from "@/dictionaries/es";

// Instrucciones para pagar una inscripción pendiente (pago en línea si Stripe está activo, y los datos de pago del organizador). Las usan «Mi cuenta» y la página del evento.
export function PayInstructions({ registrationId, amountCents, paymentInfo, stripeOn, lang, t }: {
  registrationId: string; amountCents: number; paymentInfo: string | null; stripeOn: boolean; lang: Lang; t: Dict;
}) {
  return (
    <>
      {stripeOn && <div className="mb-3 max-w-xs"><PayButton registrationId={registrationId} lang={lang} label={`${t.pay.online} · ${mxn(amountCents / 100, lang)}`} busyLabel={t.pay.onlineBusy} errors={t.pay.errors} /><p className="mt-1.5 text-xs text-muted">{t.pay.onlineHint}</p></div>}
      {stripeOn && <p className="text-muted">{t.pay.offlineHint}</p>}
      {paymentInfo ? <p className="whitespace-pre-line break-words">{paymentInfo}</p> : <p className="text-muted">{t.pay.noInstructions}</p>}
    </>
  );
}
