// Estado del formulario de crear/editar evento (KIN-774). Cuando el servidor rechaza el envío, ya no redirige (se perdía todo lo escrito): devuelve el error y los valores
// que mandó la persona, y el formulario se vuelve a pintar con ellos. Sin dependencias para probarlo con `node --test` (ver tests/event-form-state.test.mjs).

/** Lo que mandó el formulario: cada nombre de campo con todos sus valores (los campos repetidos, como las categorías, traen varios). */
export type FormValues = Record<string, string[]>;

export type EventFormState = {
  /** Cuántas veces se rechazó el envío; sirve para volver a montar los campos con los valores devueltos y para mover el foco. */
  attempt: number;
  /** El primer problema (recibe el foco). */
  error?: string;
  /** Todos los problemas encontrados, en el orden del formulario (cada uno con su campo y su mensaje). */
  errors?: string[];
  values?: FormValues;
  /** El evento ya se creó y el formulario tiene fotos por subir: en vez de redirigir, devuelve a dónde ir; el navegador sube las fotos y luego navega. */
  created?: { slug: string; url: string };
};

export const INITIAL_EVENT_FORM_STATE: EventFormState = { attempt: 0 };

// Campos que el formulario arma por su cuenta (no son lo que escribió la persona) o que no deben volver a pintarse.
const SKIP = new Set(["lang", "slug", "intent", "visibility", "photos"]);

/** Copia lo que mandó el formulario para devolverlo tal cual en el error. Solo texto: ignora archivos y los campos internos de Next. */
export function serializeFormValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || SKIP.has(name) || name.startsWith("$ACTION")) continue;
    (values[name] ??= []).push(value);
  }
  return values;
}

/** Primer valor devuelto para el campo, o `fallback` si ese campo no venía (por ejemplo, la primera vez que se pinta el formulario). Un campo vaciado a propósito ("") sí cuenta. */
export function firstValue(values: FormValues | undefined, name: string, fallback: string | number | null | undefined): string {
  const v = values?.[name]?.[0];
  return v !== undefined ? v : fallback == null ? "" : String(fallback);
}

export type ErrorTarget = {
  /** Nombre del campo (atributo `name`) que se marca y recibe el foco; "arena" es el selector o el nombre de la sede. */
  field: string;
  /** ¿Vive dentro de «Configuración avanzada»? Si sí, esa sección se abre sola. */
  advanced: boolean;
};

const opens: ErrorTarget = { field: "opensOn", advanced: true };
const closes: ErrorTarget = { field: "closesOn", advanced: true };

const TARGETS: Record<string, ErrorTarget> = {
  arena: { field: "arena", advanced: false },
  arenaRequired: { field: "arena", advanced: false },
  nameRequired: { field: "name", advanced: false },
  dateInvalid: { field: "date", advanced: false },
  costRequired: { field: "catFee", advanced: false },
  capacity: { field: "capacity", advanced: true },
  capacityInvalid: { field: "capacity", advanced: true },
  capacitySidesInvalid: { field: "capacity", advanced: true },
  capacityHeaders: { field: "capacity", advanced: true },
  capacityHeelers: { field: "capacity", advanced: true },
  capacityEach: { field: "capacity", advanced: true },
  outsideSeries: { field: "date", advanced: false },
  eventTimeInvalid: { field: "eventTime", advanced: false },
  drawType: { field: "drawType", advanced: false },
  drawLocked: { field: "drawType", advanced: false },
  invalidShots: { field: "shotsPerPackage", advanced: false },
  ratingLimit: { field: "maxRoperRating", advanced: true },
  invalidTeamLimit: { field: "maxTeamRating", advanced: true },
  invalidRounds: { field: "rounds", advanced: false },
  roundsLocked: { field: "rounds", advanced: false },
  shortGoMin: { field: "rounds", advanced: false },
  catInUse: { field: "catName", advanced: true },
  opensInvalid: opens,
  opensAfterEvent: opens,
  opensAfterClose: opens,
  closeInvalid: closes,
  closeAfterEvent: closes,
};

/** Qué campo señala un código de error. Los errores generales («faltan datos», sin campo concreto) devuelven undefined y se muestran arriba del formulario. */
export function fieldForError(error: string | undefined): ErrorTarget | undefined {
  return error ? TARGETS[error] : undefined;
}

/** Selector CSS del control que recibe el foco para ese campo. */
export function focusSelector(field: string): string {
  if (field === "arena") return '[name="arenaId"], [name="venue"], [name="city"]';
  // El cupo vive en un solo bloque con campos distintos según la forma elegida: se enfoca el que esté.
  if (field === "capacity") return '[name="capacity"], [name="capacityEach"], [name="capacityHeaders"]';
  return `[name="${field}"]`;
}
