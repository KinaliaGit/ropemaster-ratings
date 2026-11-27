"use client";
import { useActionState, useEffect, useRef } from "react";
import { createSeries, updateSeries } from "@/lib/series-actions";
import { fieldForError, firstValue, focusSelector, INITIAL_EVENT_FORM_STATE, type FormValues } from "@/lib/event-form-state";
import { ArenaFields, type ArenaChoice, type ArenaLabels } from "@/components/ArenaFields";
import { BASE } from "@/components/form-controls";
import { CapacityFields, useCapacity, type CapacityLabels } from "@/components/capacity-fields";

export type SeriesLabels = {
  name: string; description: string; start: string; end: string; templateTitle: string; templateHint: string; paymentInfo: string; paymentInfoHint: string; create: string; save: string;
  required: string; optional: string; costLabel: string; costFree: string; errorsHeading: string; capGroup: string; error: string; errors: Record<string, string>;
};
export type SeriesInitial = {
  arenaId?: string | null; slug: string; name: string; description: string; startDate: string; endDate: string;
  city: string; venue: string; capacity: number | null; capacityHeaders: number | null; capacityHeelers: number | null; categories: { name: string; fee: number }[]; paymentInfo: string;
};
type Invalid = { field: string; message: string };
const DEFAULT_CATEGORY = "Libre";

// Formulario de la serie (KIN-798): sus datos (nombre y fechas) y la configuración que se copia a cada evento nuevo (arena, costo, cupo y pago). Pide lo mismo que el de eventos y se porta igual:
// lo obligatorio con asterisco, el cupo con interruptor (igual por lado o por lado), y si el servidor rechaza el envío NO se pierde lo escrito: cada problema sale junto a su campo y en un listado arriba.
// La zona horaria (dato interno) y la modalidad (siempre Lazo) ya no se piden.
export function SeriesForm({ lang, labels: l, capLabels, initial, arenas, arenaLabels }: { lang: "es" | "en"; labels: SeriesLabels; capLabels: CapacityLabels; initial?: SeriesInitial; arenas: ArenaChoice[]; arenaLabels: ArenaLabels }) {
  const [state, formAction, pending] = useActionState(initial ? updateSeries : createSeries, INITIAL_EVENT_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const found = (state.errors ?? (state.error ? [state.error] : [])).map((code) => ({ code, target: fieldForError(code), message: l.errors[code] ?? l.error }));
  const invalid: Invalid[] = found.flatMap((x) => (x.target ? [{ field: x.target.field, message: x.message }] : []));

  useEffect(() => {
    if (!state.attempt) return;
    const t = fieldForError(state.error);
    const el = formRef.current?.querySelector<HTMLElement>(t ? focusSelector(t.field) : "#series-form-error");
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: t ? "center" : "start" });
  }, [state.attempt, state.error]);

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-5 card p-6">
      <input type="hidden" name="lang" value={lang} />
      {initial && <input type="hidden" name="slug" value={initial.slug} />}
      {found.length > 0 && (
        <div id="series-form-error" tabIndex={-1} role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800" data-testid="form-errors">
          <p className="font-medium">{l.errorsHeading}</p>
          <ul className="mt-1 list-disc pl-5">{found.map((x, i) => <li key={i}>{x.message}</li>)}</ul>
        </div>
      )}
      {/* `key` vuelve a montar los campos con lo que devolvió el servidor: así lo escrito no se pierde al fallar el envío. */}
      <SeriesFields key={state.attempt} l={l} capLabels={capLabels} initial={initial} arenas={arenas} arenaLabels={arenaLabels} values={state.values} invalid={invalid} pending={pending} />
    </form>
  );
}

function SeriesFields({ l, capLabels, initial, arenas, arenaLabels, values, invalid, pending }: {
  l: SeriesLabels; capLabels: CapacityLabels; initial?: SeriesInitial; arenas: ArenaChoice[]; arenaLabels: ArenaLabels; values: FormValues | undefined; invalid: Invalid[]; pending: boolean;
}) {
  const v = (name: string, fallback: string | number | null | undefined) => firstValue(values, name, fallback);
  const cap = useCapacity(values, initial ? { capacity: initial.capacity, headers: initial.capacityHeaders, heelers: initial.capacityHeelers } : undefined, capLabels);
  const bad = (field: string) => invalid.some((i) => i.field === field);
  const a = (field: string) => ({ className: `mt-1 ${BASE} ${bad(field) ? "border-red-600" : "border-line"}`, "aria-invalid": bad(field) || undefined, "aria-describedby": bad(field) ? `err-${field}` : undefined });
  const msg = (field: string) => bad(field) ? <p id={`err-${field}`} role="alert" className="mt-1 text-xs font-medium text-red-700">{invalid.find((i) => i.field === field)?.message}</p> : null;
  const req = <span aria-hidden className="ml-0.5 text-red-700">*</span>;
  const opt = <span className="ml-1.5 text-xs font-normal text-muted">{l.optional}</span>;

  // Costo de inscripción: la categoría única de los eventos de la serie. Se sigue guardando como categoría; su nombre y las extras de una serie vieja viajan ocultas, sin tocarlas.
  const rows = values?.catName ? values.catName.map((name, i) => ({ name, fee: values.catFee?.[i] ?? "" })) : (initial?.categories ?? []).map((c) => ({ name: c.name, fee: String(c.fee) }));
  const first = rows[0] ?? { name: DEFAULT_CATEGORY, fee: "" };

  return (
    <>
      <p className="text-xs text-muted">{req} {l.required}</p>
      <label className="block text-sm font-medium">{l.name}{req}<input required name="name" minLength={2} maxLength={120} defaultValue={v("name", initial?.name)} {...a("name")} />{msg("name")}</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{l.start}{req}<input required name="startDate" type="date" defaultValue={v("startDate", initial?.startDate)} {...a("startDate")} />{msg("startDate")}</label>
        <label className="block text-sm font-medium">{l.end}{req}<input required name="endDate" type="date" defaultValue={v("endDate", initial?.endDate)} {...a("endDate")} />{msg("endDate")}</label>
      </div>
      <label className="block text-sm font-medium">{l.description}{opt}<textarea name="description" rows={3} maxLength={1000} defaultValue={v("description", initial?.description)} {...a("description")} /></label>

      <div className="rounded-2xl bg-sand p-4">
        <h2 className="text-base font-semibold">{l.templateTitle}</h2>
        <p className="mt-0.5 text-xs text-muted">{l.templateHint}</p>
        <div className="mt-4">
          <ArenaFields arenas={arenas} labels={arenaLabels}
            initial={values ? { arenaId: v("arenaId", "") || null, venue: v("venue", ""), city: v("city", "") } : initial ? { arenaId: initial.arenaId ?? null, venue: initial.venue, city: initial.city } : undefined}
            invalid={bad("arena")} describedBy="err-arena" />
          {msg("arena")}
        </div>
        <label className="mt-4 block text-sm font-medium">{l.costLabel}{req}
          <input type="hidden" name="catName" value={first.name} />
          <input required name="catFee" type="number" min={0} inputMode="numeric" defaultValue={first.fee} {...a("catFee")} />
          <span className="mt-1 block text-xs font-normal text-muted">{l.costFree}</span>
          {msg("catFee")}
        </label>
        {rows.slice(1).map((c, i) => (
          <span key={i} hidden><input type="hidden" name="catName" value={c.name} /><input type="hidden" name="catFee" value={c.fee} /></span>
        ))}
        <div className="mt-4">
          <p className="text-sm font-medium">{l.capGroup}{opt}</p>
          <div className="mt-2"><CapacityFields state={cap} labels={capLabels} invalid={bad("capacity")} message={msg("capacity")} /></div>
        </div>
        <label className="mt-4 block text-sm font-medium">{l.paymentInfo}{opt}
          <textarea name="paymentInfo" rows={3} maxLength={1000} defaultValue={v("paymentInfo", initial?.paymentInfo)} {...a("paymentInfo")} />
          <span className="mt-1 block text-xs font-normal text-muted">{l.paymentInfoHint}</span>
        </label>
      </div>
      <button disabled={pending} className="w-full rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot disabled:opacity-60">{initial ? l.save : l.create}</button>
    </>
  );
}
