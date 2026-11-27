"use client";
import { useActionState, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { createEvent, updateEvent } from "@/lib/event-actions";
import { addEventPhoto } from "@/lib/photo-actions";
import { EventPhotoDrafts, type PhotoDraft, type PhotoDraftLabels } from "@/components/EventPhotoDrafts";
import type { CloseMode } from "@/lib/event-time";
import { fieldForError, firstValue, focusSelector, INITIAL_EVENT_FORM_STATE, type FormValues } from "@/lib/event-form-state";
import { ArenaFields, type ArenaChoice, type ArenaLabels } from "@/components/ArenaFields";
import { PublishDialog, type VisibilityLabels } from "@/components/PublishDialog";
import { teamLimitApplies } from "@/lib/rating-limits";
import { formatRounds, MAX_ROUNDS, MIN_ROUNDS_WITH_SHORT_GO } from "@/lib/event-rounds";

type Labels = {
  visibility: VisibilityLabels;
  name: string; date: string; capacity: string; disciplines: string; costLabel: string; costPackageLabel: string; costFree: string; maxRoperRating: string; maxRoperRatingHint: string;
  error: string; description: string; saveDraft: string; publish: string; photosTitle: string; photosProgress: string; photosPartial: string; goToEvent: string; save: string; errors: Record<string, string>; paymentInfo: string; paymentInfoHint: string; paymentInfoPlaceholder: string;
  opens: string; opensHint: string; closes: string; closesHint: string; opensPublish: string; opensDay: string; closeNone: string; closeEvent: string; closeDay: string; eventTime: string;
  drawType: string; drawTypeHint: string; drawLocked: string; roundRobin: string; lazadaSorteada: string; shotsPerPackage: string; shotsPerPackageHint: string; maxTeamRating: string; maxTeamRatingHint: string; rounds: string; roundsHint: string; shortGo: string; roundsWord: string; shortGoWord: string;
  advanced: string; required: string; optional: string; capGroup: string; capLimit: string; capLimitHint: string; ratingGroup: string; ratingLimit: string; teamLimit: string; regGroup: string;
  chipCapNone: string; chipRatingNone: string; chipTeamNone: string; chipOpensNone: string; chipClosesNone: string; chipCap: string; chipCapEach: string; chipCapSides: string;
  capTotal: string; capEach: string; capHeaders: string; capHeelers: string; capModeTotal: string; capModeEach: string; capModePer: string; capSummary: string; /* textos con marcadores {n} {h} {p} {t}: un componente de servidor no puede pasar funciones a uno de cliente */ chipRating: string; chipTeam: string; chipOpens: string; chipCloses: string; chipCloseEvent: string;
};
export type EventInitial = { arenaId?: string | null; slug: string; name: string; date: string; capacity: number; capacityHeaders: number | null; capacityHeelers: number | null; venue: string; city: string; description: string; paymentInfo: string; eventTime: string; opensMode: "publish" | "day"; opensOn: string; closeMode: CloseMode; closesOn: string; disciplines: string[]; maxRoperRating: number | null; drawType: "round_robin" | "lazada_sorteada"; shotsPerPackage: number | null; maxTeamRating: number | null; rounds: number | null; shortGo: boolean; drawLocked: boolean; cats: { id: string; name: string; fee: number }[] };

type Cat = { id: string; name: string; fee: number };
type DrawType = "round_robin" | "lazada_sorteada";
type CapMode = "total" | "eq" | "per";
type Invalid = { field: string; message: string } | null;
type UploadState = { done: number; total: number; failed: number; finished: boolean };
type Discipline = { id: string; label: string };

// Clase base de los campos; el borde (normal o rojo si el servidor rechazó ese campo) se agrega aparte.
const BASE = "w-full rounded-xl border bg-white px-4 py-2.5 outline-none focus:border-ink";
const DEFAULT_CATEGORY = "Libre";

// Rellena los marcadores {n}, {h}, {p} y {t} de un texto del diccionario.
const fill = (text: string, vars: Record<string, number>) => text.replace(/\{(\w)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

// Las categorías que devolvió el servidor tras un error (tres listas paralelas), o null si es la primera vez que se pinta el formulario.
function catsFrom(values: FormValues | undefined): Cat[] | null {
  const names = values?.catName;
  if (!names) return null;
  return names.map((name, i) => ({ id: values.catId?.[i] ?? "", name, fee: Number(values.catFee?.[i]) || 0 }));
}

// Opciones cerradas en una fila de botones (una sola elegida). Viaja en un campo oculto con el nombre dado.
function Segmented<T extends string>({ name, label, value, onChange, options }: { name: string; label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-2 flex overflow-hidden rounded-xl border border-line">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 px-2 text-sm transition-colors ${value === o.value ? "bg-sand font-medium text-ink" : "text-muted hover:bg-sand/60"}`}>{o.label}</button>
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-line"}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

// Crear y editar evento (KIN-774). Lo obligatorio y lo que casi siempre se llena se ve siempre; lo que limita o programa algo vive en «Configuración avanzada»,
// y cada regla opcional es un interruptor (apagado = sin regla, y su valor no se envía). El encabezado de esa sección muestra con chips lo que está activado.
// Si el servidor rechaza el envío NO se redirige: devuelve el error con lo que se escribió, el formulario se vuelve a pintar con eso, marca el campo con
// error (borde y mensaje), le da el foco y, si está dentro de «Configuración avanzada», abre esa sección.
export function EventForm({ lang, labels: l, disciplines, initial, arenas, arenaLabels, photoLabels }: { lang: "es" | "en"; labels: Labels; disciplines: Discipline[]; initial?: EventInitial; arenas: ArenaChoice[]; arenaLabels: ArenaLabels; photoLabels?: PhotoDraftLabels }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(initial ? updateEvent : createEvent, INITIAL_EVENT_FORM_STATE);
  // Fotos elegidas al crear el evento: viven aquí (no en los campos, que se vuelven a montar si el servidor rechaza el envío) y se suben justo después de crearlo.
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const uploadedFor = useRef<string | null>(null);
  const latestPhotos = useRef<PhotoDraft[]>([]);
  useEffect(() => { latestPhotos.current = photos; }, [photos]);
  useEffect(() => () => latestPhotos.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const [advOpen, setAdvOpen] = useState(false);
  const [seenAttempt, setSeenAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const target = fieldForError(state.error);
  // Ajuste de estado al recibir un rechazo nuevo: si el campo con error está en «Configuración avanzada», se abre antes de pintar (así el foco sí lo alcanza).
  if (state.attempt !== seenAttempt) {
    setSeenAttempt(state.attempt);
    if (target?.advanced) setAdvOpen(true);
  }
  const invalid: Invalid = state.error && target ? { field: target.field, message: l.errors[state.error] ?? l.error } : null;
  const banner = state.error && !target ? (l.errors[state.error] ?? l.error) : null;

  // El evento ya se creó: se suben sus fotos en orden (la primera queda de portada) y luego se navega a su página. Si alguna falla, se avisa y se ofrece ir al evento.
  useEffect(() => {
    const created = state.created;
    if (!created || uploadedFor.current === created.slug) return;
    uploadedFor.current = created.slug;
    const list = latestPhotos.current;
    void (async () => {
      let failed = 0;
      setUpload({ done: 0, total: list.length, failed: 0, finished: false });
      for (let i = 0; i < list.length; i++) {
        try {
          const fd = new FormData();
          fd.set("event", created.slug);
          fd.set("file", list[i].blob, "foto.jpg");
          const res = await addEventPhoto(fd);
          if (!res.ok) failed++;
        } catch { failed++; }
        setUpload({ done: i + 1, total: list.length, failed, finished: false });
      }
      if (failed === 0) router.push(created.url);
      else setUpload({ done: list.length, total: list.length, failed, finished: true });
    })();
  }, [state.created, router]);

  useEffect(() => {
    if (!state.attempt) return;
    const t = fieldForError(state.error);
    const el = formRef.current?.querySelector<HTMLElement>(t ? focusSelector(t.field) : "#event-form-error");
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: t ? "center" : "start" });
  }, [state.attempt, state.error]);

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-5 card p-6">
      <input type="hidden" name="lang" value={lang} />
      {initial && <input type="hidden" name="slug" value={initial.slug} />}
      {banner && <p id="event-form-error" tabIndex={-1} role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{banner}</p>}
      {/* `key` vuelve a montar los campos con lo que devolvió el servidor: así lo escrito no se pierde ni se reinicia al fallar el envío. */}
      <EventFields
        key={state.attempt} l={l} disciplines={disciplines} initial={initial} arenas={arenas} arenaLabels={arenaLabels}
        values={state.values} invalid={invalid} pending={pending} advOpen={advOpen} setAdvOpen={setAdvOpen}
        photos={photos} setPhotos={setPhotos} photoLabels={photoLabels} created={state.created} upload={upload}
      />
    </form>
  );
}

function EventFields({ l, disciplines, initial, arenas, arenaLabels, values, invalid, pending, advOpen, setAdvOpen, photos, setPhotos, photoLabels, created, upload }: {
  l: Labels; disciplines: Discipline[]; initial?: EventInitial; arenas: ArenaChoice[]; arenaLabels: ArenaLabels;
  values: FormValues | undefined; invalid: Invalid; pending: boolean; advOpen: boolean; setAdvOpen: (open: boolean) => void;
  photos: PhotoDraft[]; setPhotos: Dispatch<SetStateAction<PhotoDraft[]>>; photoLabels?: PhotoDraftLabels; created?: { slug: string; url: string }; upload: UploadState | null;
}) {
  const v = (name: string, fallback: string | number | null | undefined) => firstValue(values, name, fallback);
  // Un campo opcional está «encendido» si ya traía valor (al editar) o si el envío rechazado lo mandó (un interruptor apagado no manda su campo).
  const wasOn = (name: string, hasValue: boolean) => (values ? values[name] !== undefined : hasValue);

  const [drawType, setDrawType] = useState<DrawType>(() => (v("drawType", initial?.drawType ?? "round_robin") === "lazada_sorteada" ? "lazada_sorteada" : "round_robin"));
  const [roundsVal, setRoundsVal] = useState(() => v("rounds", initial?.rounds));
  const [shortGo, setShortGo] = useState(() => v("shortGo", String(initial?.shortGo ?? true)) !== "false");
  // Cupo (KIN-775): apagado = sin límite. Encendido, se elige igual por lado o por lado (el total se calcula solo). Un evento que ya tenía solo un total lo conserva como «Total».
  const hasSides = !!initial && (initial.capacityHeaders !== null || initial.capacityHeelers !== null);
  const sidesEqual = !!initial && initial.capacityHeaders === initial.capacityHeelers;
  const legacyTotal = !!initial && initial.capacity > 0 && !hasSides;
  const [capOn, setCapOn] = useState(() => (values ? v("capacityMode", "none") !== "none" : (initial?.capacity ?? 0) > 0 || hasSides));
  const [capMode, setCapMode] = useState<CapMode>(() => {
    const m = v("capacityMode", "");
    if (m === "total" || m === "eq" || m === "per") return m;
    if (hasSides) return sidesEqual ? "eq" : "per";
    return legacyTotal ? "total" : "eq";
  });
  const [capTotal, setCapTotal] = useState(() => v("capacity", initial?.capacity || ""));
  const [capEach, setCapEach] = useState(() => v("capacityEach", hasSides && sidesEqual ? initial?.capacityHeaders : ""));
  const [capHeaders, setCapHeaders] = useState(() => v("capacityHeaders", initial?.capacityHeaders));
  const [capHeelers, setCapHeelers] = useState(() => v("capacityHeelers", initial?.capacityHeelers));
  const [ratingOn, setRatingOn] = useState(() => wasOn("maxRoperRating", initial?.maxRoperRating != null));
  const [ratingVal, setRatingVal] = useState(() => v("maxRoperRating", initial?.maxRoperRating));
  const [teamOn, setTeamOn] = useState(() => wasOn("maxTeamRating", initial?.maxTeamRating != null));
  const [teamVal, setTeamVal] = useState(() => v("maxTeamRating", initial?.maxTeamRating));
  const [opensMode, setOpensMode] = useState<"publish" | "day">(() => (v("opensMode", initial?.opensMode ?? "publish") === "day" ? "day" : "publish"));
  const [opensOn, setOpensOn] = useState(() => v("opensOn", initial?.opensOn));
  const [closeMode, setCloseMode] = useState<CloseMode>(() => { const m = v("closeMode", initial?.closeMode ?? "none"); return m === "event" || m === "day" ? m : "none"; });
  const [closesOn, setClosesOn] = useState(() => v("closesOn", initial?.closesOn));
  const locked = initial?.drawLocked ?? false; // con inscritos o resultados el tipo y los tiros por paquete ya no cambian (la base lo impone)
  const advanced = useRef<HTMLDetailsElement>(null);

  // Si el navegador va a señalar un campo obligatorio vacío que está dentro de «Configuración avanzada», se abre antes de que intente darle el foco;
  // un campo dentro de un <details> cerrado no se puede enfocar y el envío se frenaría sin avisar.
  useEffect(() => {
    const el = advanced.current;
    if (!el) return;
    const open = () => flushSync(() => setAdvOpen(true));
    el.addEventListener("invalid", open, true);
    return () => el.removeEventListener("invalid", open, true);
  }, [setAdvOpen]);

  const bad = (field: string) => invalid?.field === field;
  // Clases y atributos de accesibilidad de un campo; `margin` cambia el margen superior cuando el campo no va dentro de una etiqueta.
  const a = (field: string, margin = "mt-1") => ({
    className: `${margin} ${BASE} ${bad(field) ? "border-red-600" : "border-line"}`,
    "aria-invalid": bad(field) || undefined,
    "aria-describedby": bad(field) ? `err-${field}` : undefined,
  });
  const msg = (field: string) => bad(field) ? <p id={`err-${field}`} role="alert" className="mt-1 text-xs font-medium text-red-700">{invalid!.message}</p> : null;
  const req = <span aria-hidden className="ml-0.5 text-red-700">*</span>;
  const opt = <span className="ml-1.5 text-xs font-normal text-muted">{l.optional}</span>;

  // Costo de inscripción: la categoría única del evento (KIN-774). Se sigue guardando como categoría porque las inscripciones y los cobros dependen de ella;
  // su nombre y las categorías extra que un evento viejo ya tuviera viajan ocultas, sin tocarlas.
  const cats = catsFrom(values) ?? initial?.cats ?? [];
  const first: Cat = cats[0] ?? { id: "", name: DEFAULT_CATEGORY, fee: 0 };
  const costDefault = values ? firstValue(values, "catFee", "") : initial?.cats[0] ? String(initial.cats[0].fee) : "";

  const arenaInitial = values
    ? { arenaId: v("arenaId", "") || null, venue: v("venue", ""), city: v("city", "") }
    : initial ? { arenaId: initial.arenaId ?? null, venue: initial.venue, city: initial.city } : undefined;
  // KIN-776: el rating por equipo solo se pide en Lazada Sorteada; en Round Robin no se muestra ni se envía (el servidor también lo ignora).
  const showTeam = teamLimitApplies(drawType);

  const group = "border-t border-line pt-4 first:border-0 first:pt-0";
  const whole = (s: string) => Math.max(0, parseInt(s, 10) || 0);
  const sidesReady = capHeaders !== "" && capHeelers !== "";
  const capSummary = !capOn ? "" : capMode === "eq" ? (whole(capEach) > 0 ? fill(l.capSummary, { h: whole(capEach), p: whole(capEach), t: 2 * whole(capEach) }) : "") : capMode === "per" ? (sidesReady ? fill(l.capSummary, { h: whole(capHeaders), p: whole(capHeelers), t: whole(capHeaders) + whole(capHeelers) }) : "") : "";
  const capChip = !capOn ? null : capMode === "total" ? (capTotal ? `${l.chipCap} ${capTotal}` : null) : capMode === "eq" ? (whole(capEach) > 0 ? fill(l.chipCapEach, { n: whole(capEach) }) : null) : sidesReady ? fill(l.chipCapSides, { h: whole(capHeaders), p: whole(capHeelers) }) : null;
  const chips: { text: string; on: boolean }[] = [
    capChip ? { text: capChip, on: true } : { text: l.chipCapNone, on: false },
    // Cada ajuste muestra SIEMPRE su estado: lo activado en normal y lo que está por defecto (sin límite, sin fecha) en gris, para que se sepa qué pasa si no se toca nada.
    ratingOn && ratingVal ? { text: `${l.chipRating} ${ratingVal}`, on: true } : { text: l.chipRatingNone, on: false },
    ...(showTeam ? [teamOn && teamVal ? { text: `${l.chipTeam} ${teamVal}`, on: true } : { text: l.chipTeamNone, on: false }] : []),
    opensMode === "day" ? { text: l.chipOpens, on: true } : { text: l.chipOpensNone, on: false },
    closeMode === "event" ? { text: l.chipCloseEvent, on: true } : closeMode === "day" ? { text: l.chipCloses, on: true } : { text: l.chipClosesNone, on: false },
  ];
  // KIN-777: las rondas son el TOTAL e incluyen el short-go (3 con short-go = 2 normales + 1 short-go); aquí se ve el resultado en palabras.
  const roundsNum = /^[0-9]+$/.test(roundsVal) ? Number(roundsVal) : 0;
  const roundsSummary = roundsNum >= 1 && roundsNum <= MAX_ROUNDS ? formatRounds(roundsNum, shortGo, l.roundsWord, l.shortGoWord) : "";

  return (
    <>
      <p className="text-xs text-muted">{req} {l.required}</p>
      <label className="block text-sm font-medium">{l.name}{req}<input required name="name" maxLength={120} defaultValue={v("name", initial?.name)} {...a("name")} />{msg("name")}</label>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{l.date}{req}<input required name="date" type="date" defaultValue={v("date", initial?.date)} {...a("date")} />{msg("date")}</label>
        <label className="block text-sm font-medium">{l.eventTime}{opt}<input name="eventTime" type="time" defaultValue={v("eventTime", initial?.eventTime)} {...a("eventTime")} />{msg("eventTime")}</label>
      </div>
      <div>
        <ArenaFields arenas={arenas} labels={arenaLabels} initial={arenaInitial} invalid={bad("arena")} describedBy="err-arena" />
        {msg("arena")}
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{l.drawType}{req}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["round_robin", "lazada_sorteada"] as const).map((t) => (
            <label key={t} className={`flex items-center rounded-xl border p-3 text-sm has-checked:border-ink has-checked:bg-sand ${bad("drawType") ? "border-red-600" : "border-line"} ${locked ? "opacity-70" : "cursor-pointer"}`}>
              <input type="radio" name={locked ? undefined : "drawType"} value={t} checked={drawType === t} disabled={locked} onChange={() => setDrawType(t)} aria-describedby={bad("drawType") ? "err-drawType" : undefined} className="mr-2 accent-brand" />
              {t === "round_robin" ? l.roundRobin : l.lazadaSorteada}
            </label>
          ))}
        </div>
        {locked && <input type="hidden" name="drawType" value={drawType} />}
        <p className="mt-1 text-xs text-muted">{locked ? l.drawLocked : l.drawTypeHint}</p>
        {msg("drawType")}
        {drawType === "lazada_sorteada" && (
          <label className="mt-3 block text-sm font-medium">{l.shotsPerPackage}{req}
            <input name={locked ? undefined : "shotsPerPackage"} type="number" required min={1} max={999} step={1} inputMode="numeric" defaultValue={v("shotsPerPackage", initial?.shotsPerPackage)} readOnly={locked} {...a("shotsPerPackage")} />
            {locked && <input type="hidden" name="shotsPerPackage" value={initial?.shotsPerPackage ?? ""} />}
            <span className="mt-1 block text-xs font-normal text-muted">{l.shotsPerPackageHint}</span>
            {msg("shotsPerPackage")}
          </label>
        )}
      </fieldset>
      {/* Hoy solo hay una modalidad activa: no se ofrece (viaja sola). Cuando haya más de una, aparece el selector. */}
      {disciplines.length > 1 ? (
        <fieldset>
          <legend className="text-sm font-medium">{l.disciplines}</legend>
          {disciplines.map((d) => <label key={d.id} className="mr-4 text-sm"><input type="checkbox" name="discipline" value={d.id} defaultChecked={values ? (values.discipline ?? []).includes(d.id) : initial ? initial.disciplines.includes(d.id) : true} className="mr-1 accent-brand" />{d.label}</label>)}
        </fieldset>
      ) : disciplines.map((d) => <input key={d.id} type="hidden" name="discipline" value={d.id} />)}

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{drawType === "lazada_sorteada" ? l.costPackageLabel : l.costLabel}{req}
          <input type="hidden" name="catId" value={first.id} />
          <input type="hidden" name="catName" value={first.name} />
          <input required name="catFee" type="number" min={0} inputMode="numeric" defaultValue={costDefault} {...a("catFee")} />
          <span className="mt-1 block text-xs font-normal text-muted">{l.costFree}</span>
        </label>
        <div>
          <label className="block text-sm font-medium">{l.rounds}{opt}
            <input name="rounds" type="number" min={shortGo ? MIN_ROUNDS_WITH_SHORT_GO : 1} max={MAX_ROUNDS} step={1} inputMode="numeric" value={roundsVal} onChange={(e) => setRoundsVal(e.target.value)} {...a("rounds")} />
          </label>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span>{l.shortGo}</span><Switch on={shortGo} onChange={setShortGo} label={l.shortGo} /></div>
          <input type="hidden" name="shortGo" value={String(shortGo)} />
          <p className="mt-1 text-xs text-muted">{roundsSummary || l.roundsHint}</p>
          {msg("rounds")}
        </div>
      </div>
      {cats.slice(1).map((c, i) => (
        <span key={i} hidden>
          <input type="hidden" name="catId" value={c.id} />
          <input type="hidden" name="catName" value={c.name} />
          <input type="hidden" name="catFee" value={c.fee} />
        </span>
      ))}
      <label className="block text-sm font-medium">{l.paymentInfo}{opt}
        <textarea name="paymentInfo" rows={3} maxLength={1000} defaultValue={v("paymentInfo", initial?.paymentInfo)} placeholder={l.paymentInfoPlaceholder} {...a("paymentInfo")} />
        <span className="mt-1 block text-xs font-normal text-muted">{l.paymentInfoHint}</span>
      </label>
      <label className="block text-sm font-medium">{l.description}{opt}<textarea name="description" rows={4} maxLength={1000} defaultValue={v("description", initial?.description)} {...a("description")} /></label>

      <details ref={advanced} open={advOpen} onToggle={(e) => setAdvOpen(e.currentTarget.open)} className="group rounded-xl border border-line" data-testid="advanced-config">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            {l.advanced}
            <span className="mt-1.5 flex flex-wrap gap-1.5" data-testid="advanced-chips">
              {chips.map((c) => <span key={c.text} className={`rounded-full bg-sand px-2 py-0.5 text-xs font-normal ${c.on ? "text-ink" : "text-muted"}`}>{c.text}</span>)}
            </span>
          </span>
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <div className={group}>
            <p className="text-xs text-muted">{l.capGroup}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span>{l.capLimit}</span><Switch on={capOn} onChange={setCapOn} label={l.capLimit} /></div>
            {capOn && (
              <div className="mt-2">
                <Segmented name="capacityMode" label={l.capLimit} value={capMode} onChange={setCapMode}
                  options={[...(legacyTotal ? [{ value: "total" as const, label: l.capModeTotal }] : []), { value: "eq" as const, label: l.capModeEach }, { value: "per" as const, label: l.capModePer }]} />
                {capMode === "total" && <label className="mt-2 block text-sm font-medium">{l.capTotal}<input name="capacity" type="number" required min={1} inputMode="numeric" value={capTotal} onChange={(e) => setCapTotal(e.target.value)} {...a("capacity")} /></label>}
                {capMode === "eq" && <label className="mt-2 block text-sm font-medium">{l.capEach}<input name="capacityEach" type="number" required min={1} inputMode="numeric" value={capEach} onChange={(e) => setCapEach(e.target.value)} {...a("capacity")} /></label>}
                {capMode === "per" && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium">{l.capHeaders}<input name="capacityHeaders" type="number" required min={0} inputMode="numeric" value={capHeaders} onChange={(e) => setCapHeaders(e.target.value)} {...a("capacity")} /></label>
                    <label className="block text-sm font-medium">{l.capHeelers}<input name="capacityHeelers" type="number" required min={0} inputMode="numeric" value={capHeelers} onChange={(e) => setCapHeelers(e.target.value)} {...a("capacity")} /></label>
                  </div>
                )}
                {capSummary && <p className="mt-2 text-sm text-muted" data-testid="capacity-summary">{capSummary}</p>}
                <p className="mt-1 text-xs text-muted">{l.capLimitHint}</p>
                {msg("capacity")}
              </div>
            )}
          </div>
          <div className={group}>
            <p className="text-xs text-muted">{l.ratingGroup}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span>{l.ratingLimit}</span><Switch on={ratingOn} onChange={setRatingOn} label={l.ratingLimit} /></div>
            {ratingOn && (
              <label className="mt-2 block text-sm font-medium">{l.maxRoperRating}
                <input name="maxRoperRating" type="number" required min={0} max={10} step={0.1} inputMode="decimal" value={ratingVal} onChange={(e) => setRatingVal(e.target.value)} {...a("maxRoperRating")} />
                <span className="mt-1 block text-xs font-normal text-muted">{l.maxRoperRatingHint}</span>
                {msg("maxRoperRating")}
              </label>
            )}
            {showTeam && <div className="mt-3 flex items-center justify-between gap-3 text-sm"><span>{l.teamLimit}</span><Switch on={teamOn} onChange={setTeamOn} label={l.teamLimit} /></div>}
            {showTeam && teamOn && (
              <label className="mt-2 block text-sm font-medium">{l.maxTeamRating}
                <input name="maxTeamRating" type="number" required min={0} max={20} step={0.1} inputMode="decimal" value={teamVal} onChange={(e) => setTeamVal(e.target.value)} {...a("maxTeamRating")} />
                <span className="mt-1 block text-xs font-normal text-muted">{l.maxTeamRatingHint}</span>
                {msg("maxTeamRating")}
              </label>
            )}
          </div>
          <div className={group}>
            <p className="text-xs text-muted">{l.regGroup}</p>
            <fieldset className="mt-2">
              <legend className="text-sm font-medium">{l.opens}</legend>
              <p className="mt-0.5 text-xs text-muted">{l.opensHint}</p>
              <Segmented name="opensMode" label={l.opens} value={opensMode} onChange={setOpensMode} options={[{ value: "publish", label: l.opensPublish }, { value: "day", label: l.opensDay }]} />
              {opensMode === "day" && <input name="opensOn" type="date" required value={opensOn} onChange={(e) => setOpensOn(e.target.value)} aria-label={l.opens} {...a("opensOn", "mt-2 sm:w-1/2")} />}
              {msg("opensOn")}
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">{l.closes}</legend>
              <p className="mt-0.5 text-xs text-muted">{l.closesHint}</p>
              <Segmented name="closeMode" label={l.closes} value={closeMode} onChange={setCloseMode} options={[{ value: "none", label: l.closeNone }, { value: "event", label: l.closeEvent }, { value: "day", label: l.closeDay }]} />
              {closeMode === "day" && <input name="closesOn" type="date" required value={closesOn} onChange={(e) => setClosesOn(e.target.value)} aria-label={l.closes} {...a("closesOn", "mt-2 sm:w-1/2")} />}
              {msg("closesOn")}
            </fieldset>
          </div>
        </div>
      </details>

      {/* Fotos y portada (solo al crear): se eligen aquí y se suben justo después de crear el evento. Al editar se manejan en la página del evento. */}
      {!initial && photoLabels && (
        <fieldset disabled={!!created}>
          <legend className="text-sm font-medium">{l.photosTitle}{opt}</legend>
          <div className="mt-2"><EventPhotoDrafts photos={photos} setPhotos={setPhotos} labels={photoLabels} disabled={!!created || pending} /></div>
          {photos.length > 0 && <input type="hidden" name="photos" value="1" />}
        </fieldset>
      )}
      {created ? (
        <div role="status" className="rounded-xl bg-sand p-4 text-sm" data-testid="photo-upload-status">
          {upload?.finished ? (
            <>
              <p className="font-medium text-red-800">{fill(l.photosPartial, { n: upload.failed })}</p>
              <Link href={created.url} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-white hover:bg-brand-hot">{l.goToEvent}</Link>
            </>
          ) : <p>{fill(l.photosProgress, { d: upload?.done ?? 0, t: upload?.total ?? photos.length })}</p>}
        </div>
      ) : initial ? (
        <button disabled={pending} className="w-full rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot disabled:opacity-60">{l.save}</button>
      ) : (
        <div className="flex gap-3">
          <button name="intent" value="draft" disabled={pending} className="flex-1 rounded-full bg-sand py-3 text-sm font-medium transition hover:bg-line disabled:opacity-60">{l.saveDraft}</button>
          {/* KIN-769: al publicar se pregunta quién puede ver el evento (público o privado); guardar borrador no pregunta nada */}
          <PublishDialog publishLabel={l.publish} labels={l.visibility} className="flex-1 rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot" />
        </div>
      )}
    </>
  );
}
