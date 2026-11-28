import test from "node:test";
import assert from "node:assert/strict";
import { buildPoster, checkPosterLogo, clockLabel, cutText, fitName, MAX_LOGO_BYTES, nameLines, POSTER } from "../src/lib/event-poster.ts";

const es = {
  organizer: "Organiza", signUp: "Inscríbete en Rope Master", modality: "Modalidad", format: "Formato", registration: "Inscripción", capacity: "Cupo",
  seats: "lugares", headers: "cabeceros", heelers: "pialadores", ratingMax: "Rating máx.", teamMax: "Equipo máx.", perPackage: "por paquete", free: "Gratis",
  shotsPerPackage: "tiros por paquete", closesOn: "Inscripciones hasta el", more: (n) => `+${n} más`,
  roundRobin: "Round Robin", lazadaSorteada: "Lazada Sorteada", roundsWord: "rondas", shortGoWord: "short-go",
};
const en = { ...es, closesOn: "Registration open until", seats: "spots", more: (n) => `+${n} more`, roundsWord: "rounds", shortGoWord: "short-go" };

// Evento completo (lo mismo que el boceto aprobado).
const full = {
  name: "Las Tunas Thanksgiving Invitacional", date: "2026-11-21", time: "12:00", venue: "Arena Las Tunas", city: "Chihuahua, Chih.",
  disciplineLabel: "Lazo", drawType: "lazada_sorteada", shotsPerPackage: 8, rounds: 3, shortGo: true,
  categories: [{ name: "Libre", fee: 6000 }, { name: "Amateur", fee: 3500 }],
  capacity: 40, capacityHeaders: 20, capacityHeelers: 20, maxRoperRating: 6, maxTeamRating: 10,
  registrationClosesAt: "2026-11-20T05:59:59.000Z", timezone: "America/Mexico_City", series: "Serie Invierno 2026",
  description: "Primer novillo a las 12:00, puntualidad estricta.", organizer: "Rancho Las Tunas",
};
// Solo lo que un evento publicado siempre tiene (publicar exige ciudad, lugar, cupo y categorías) y nada de lo opcional.
const minimal = {
  ...full, name: "Lazada de Primavera", time: null, drawType: "round_robin", shotsPerPackage: null, rounds: null, shortGo: true,
  categories: [{ name: "Libre", fee: 1500 }], capacityHeaders: null, capacityHeelers: null, maxRoperRating: null, maxTeamRating: null,
  registrationClosesAt: null, series: null, description: "",
};

test("el evento completo se formatea como en el boceto: día, mes, hora, arena, rondas con short-go, costo, cupo y cierre", () => {
  const m = buildPoster(full, "es", es);
  assert.equal(m.day, "21");
  assert.equal(m.monthYear, "NOVIEMBRE 2026");
  assert.equal(m.whenLine, "Sábado · 12:00 PM");
  assert.equal(m.place, "Arena Las Tunas, Chihuahua, Chih.");
  assert.equal(m.series, "Serie Invierno 2026");
  assert.equal(m.organizer, "Rancho Las Tunas");
  assert.equal(m.closing, "Inscripciones hasta el 19 de noviembre", "las 23:59 del 19 en México son las 05:59 UTC del 20: el día se cuenta en la zona del evento");
  const byKey = Object.fromEntries(m.cellRows.flat().map((c) => [c.key, c]));
  assert.deepEqual(Object.keys(byKey), ["modality", "format", "registration", "capacity"]);
  assert.equal(byKey.modality.rows[1].muted, "Lazada Sorteada · 8 tiros por paquete");
  assert.equal(byKey.format.rows[0].strong, "2 rondas + short-go", "3 rondas con short-go son 2 normales + 1 short-go");
  assert.equal(byKey.format.rows[1].muted, "Rating máx. 6 · Equipo máx. 10");
  assert.equal(byKey.registration.rows[0].strong, "$6,000");
  assert.equal(byKey.registration.rows[0].muted, "Libre, por paquete");
  assert.equal(byKey.registration.rows[1].strong, "$3,500");
  assert.deepEqual(byKey.capacity.rows.map((r) => r.muted), ["lugares", "20 cabeceros · 20 pialadores"]);
  assert.equal(byKey.capacity.rows[0].strong, "40");
});

test("sin lo opcional no quedan huecos: sin hora, serie, rondas, límites, cierre ni descripción esos bloques simplemente no aparecen", () => {
  const m = buildPoster(minimal, "es", es);
  assert.equal(m.whenLine, "Sábado", "sin hora solo el día de la semana");
  assert.equal(m.series, null);
  assert.equal(m.closing, null);
  assert.equal(m.description, null);
  const keys = m.cellRows.flat().map((c) => c.key);
  assert.deepEqual(keys, ["modality", "registration", "capacity"], "sin rondas ni ratings no hay celda de formato");
  assert.equal(m.cellRows.length, 2, "tres celdas: una fila de dos y otra de una");
  const reg = m.cellRows.flat().find((c) => c.key === "registration");
  assert.equal(reg.rows[0].muted, "Libre", "en Round Robin el costo no es por paquete");
  const cap = m.cellRows.flat().find((c) => c.key === "capacity");
  assert.equal(cap.rows.length, 1, "sin tope por lado solo el total");
});

test("sin cupo (0 = sin límite) ni categorías esas celdas se omiten; un costo de 0 dice Gratis", () => {
  const m = buildPoster({ ...minimal, capacity: 0, categories: [{ name: "Libre", fee: 0 }] }, "es", es);
  assert.deepEqual(m.cellRows.flat().map((c) => c.key), ["modality", "registration"]);
  assert.equal(m.cellRows.flat()[1].rows[0].strong, "Gratis");
  const none = buildPoster({ ...minimal, capacity: 0, categories: [] }, "es", es);
  assert.deepEqual(none.cellRows.flat().map((c) => c.key), ["modality"]);
});

test("sin arena ni ciudad no se dibuja el lugar; con una sola de las dos, solo esa", () => {
  assert.equal(buildPoster({ ...full, venue: "", city: "" }, "es", es).place, null);
  assert.equal(buildPoster({ ...full, venue: "Arena Las Tunas", city: "" }, "es", es).place, "Arena Las Tunas");
  assert.equal(buildPoster({ ...full, venue: "  ", city: "Chihuahua" }, "es", es).place, "Chihuahua");
});

test("el idioma manda: fecha, hora y textos salen en inglés si el usuario lo tiene así", () => {
  const m = buildPoster(full, "en", en);
  assert.equal(m.monthYear, "NOVEMBER 2026");
  assert.equal(m.whenLine, "Saturday · 12:00 PM");
  assert.equal(m.closing, "Registration open until November 19");
  assert.equal(m.cellRows.flat().find((c) => c.key === "capacity").rows[0].muted, "spots");
});

test("con muchas categorías se muestran 4 y el resto se resume", () => {
  const cats = ["A", "B", "C", "D", "E", "F"].map((name, i) => ({ name, fee: 1000 * (i + 1) }));
  const reg = buildPoster({ ...full, categories: cats }, "es", es).cellRows.flat().find((c) => c.key === "registration");
  assert.equal(reg.rows.length, 5);
  assert.equal(reg.rows[4].muted, "+2 más");
});

test("el cierre de otro año lleva el año; una fecha inválida no rompe el póster", () => {
  assert.equal(buildPoster({ ...full, registrationClosesAt: "2027-01-10T12:00:00.000Z" }, "es", es).closing, "Inscripciones hasta el 10 de enero de 2027");
  const bad = buildPoster({ ...full, date: "no-es-fecha", registrationClosesAt: "tampoco" }, "es", es);
  assert.equal(bad.day, "–");
  assert.equal(bad.whenLine, "12:00 PM");
  assert.equal(bad.closing, null);
});

test("la hora se muestra en formato de 12 horas y lo que no es hora se ignora", () => {
  assert.equal(clockLabel("00:30"), "12:30 AM");
  assert.equal(clockLabel("12:00"), "12:00 PM");
  assert.equal(clockLabel("09:05"), "9:05 AM");
  assert.equal(clockLabel("23:59"), "11:59 PM");
  for (const bad of [null, undefined, "", "24:00", "9:00", "12:60", "mediodía"]) assert.equal(clockLabel(bad), null, String(bad));
});

test("cutText no parte palabras y deja el texto corto igual", () => {
  assert.equal(cutText("  hola   mundo  ", 50), "hola mundo");
  assert.equal(cutText("uno dos tres cuatro cinco", 14), "uno dos tres…");
  assert.ok(cutText("x".repeat(100), 20).length <= 20);
});

test("el nombre se ajusta solo: corto va grande, largo baja de tamaño, y nunca se desborda ni se corta a media palabra", () => {
  const short = fitName("Lazada de Primavera", 800);
  const long = fitName("Gran Copa Internacional de Lazo por Parejas Memorial Don Ramón Villalobos 2026", 800);
  assert.ok(short.size > long.size, `${short.size} debe ser mayor que ${long.size}`);
  assert.equal(short.text, "LAZADA DE PRIMAVERA", "va en mayúsculas");
  for (const name of ["Las Tunas Thanksgiving Invitacional", "Copa Internacional de Lazo por Parejas Memorial Don Ramón Villalobos de la Sierra Tarahumara 2026", "A", "X ".repeat(40)]) {
    for (const maxHeight of [230, 400, 800]) {
      const { text, size } = fitName(name, maxHeight);
      const lines = nameLines(text, size);
      assert.ok(Number.isFinite(lines), `${name}: ninguna palabra puede ser más ancha que el póster`);
      assert.ok(lines * size * 1.02 <= maxHeight + 0.001, `${name} en ${maxHeight}px: ${lines} líneas de ${size}px no caben`);
    }
  }
});

test("un nombre imposible de ajustar se acorta con puntos suspensivos en lugar de desbordar", () => {
  const huge = "palabra ".repeat(60).trim();
  const fit = fitName(huge, 230);
  assert.ok(fit.text.endsWith("…"));
  assert.ok(nameLines(fit.text, fit.size) * fit.size * 1.02 <= 230);
  const oneWord = fitName("A".repeat(200), 230);
  assert.ok(oneWord.text.endsWith("…"));
  assert.ok(Number.isFinite(nameLines(oneWord.text, oneWord.size)));
});

test("con poco alto libre la descripción se sacrifica antes que achicar el nombre a lo mínimo", () => {
  const crowded = {
    ...full, name: "Gran Copa Internacional de Lazo por Parejas Memorial Don Ramón Villalobos 2026",
    categories: ["A", "B", "C", "D", "E"].map((name, i) => ({ name, fee: 1000 * (i + 1) })),
    description: "Reglas del evento. ".repeat(10),
  };
  const m = buildPoster(crowded, "es", es);
  assert.equal(m.description, null);
  assert.ok(m.name.size >= 44);
});

test("el póster es 4:5 (1080 x 1350)", () => {
  assert.equal(POSTER.width * 5, POSTER.height * 4);
  assert.equal(POSTER.width, 1080);
});

test("el logo solo acepta PNG o JPG reales, con tope de peso; SVG, GIF, WebP sin convertir y HTML no", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  assert.deepEqual(checkPosterLogo(png), { ok: true, mime: "image/png" });
  assert.deepEqual(checkPosterLogo(jpg), { ok: true, mime: "image/jpeg" });
  assert.deepEqual(checkPosterLogo(new Uint8Array(0)), { ok: false, reason: "empty" });
  assert.deepEqual(checkPosterLogo(new Uint8Array(MAX_LOGO_BYTES + 1).fill(0xff)), { ok: false, reason: "too_big" });
  const enc = (s) => new TextEncoder().encode(s);
  for (const fake of [enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), enc("GIF89a......"), enc("<html><script>alert(1)</script></html>"), enc("RIFF....WEBPVP8 ")]) {
    assert.deepEqual(checkPosterLogo(fake), { ok: false, reason: "not_image" });
  }
  // Un archivo con nombre .png pero contenido distinto no pasa: solo cuentan los bytes.
  assert.equal(checkPosterLogo(enc("esto no es un png")).ok, false);
});
