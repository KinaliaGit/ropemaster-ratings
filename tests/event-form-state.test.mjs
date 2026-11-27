import test from "node:test";
import assert from "node:assert/strict";
import { fieldForError, firstValue, focusSelector, serializeFormValues, INITIAL_EVENT_FORM_STATE } from "../src/lib/event-form-state.ts";

test("serializeFormValues conserva lo escrito, incluidos los campos repetidos y los vacíos", () => {
  const fd = new FormData();
  fd.append("name", "Gran final");
  fd.append("rounds", ""); // vaciado a propósito: tiene que volver vacío, no con el valor de antes
  fd.append("catName", "Libre");
  fd.append("catName", "Amateur");
  fd.append("catFee", "800");
  fd.append("catFee", "500");
  assert.deepEqual(serializeFormValues(fd), { name: ["Gran final"], rounds: [""], catName: ["Libre", "Amateur"], catFee: ["800", "500"] });
});

test("serializeFormValues deja fuera los campos internos y los archivos", () => {
  const fd = new FormData();
  fd.append("lang", "es");
  fd.append("slug", "mi-evento");
  fd.append("intent", "publish");
  fd.append("visibility", "privado");
  fd.append("$ACTION_ID_abc", "x");
  fd.append("cover", new Blob(["x"]), "x.png");
  fd.append("city", "Monterrey");
  assert.deepEqual(serializeFormValues(fd), { city: ["Monterrey"] });
});

test("firstValue prefiere lo devuelto por el servidor, incluso vacío, y si no hay usa el valor de respaldo", () => {
  const values = { name: ["Gran final"], rounds: [""] };
  assert.equal(firstValue(values, "name", "otro"), "Gran final");
  assert.equal(firstValue(values, "rounds", 5), "");
  assert.equal(firstValue(values, "capacity", 100), "100");
  assert.equal(firstValue(undefined, "name", "inicial"), "inicial");
  assert.equal(firstValue(undefined, "name", null), "");
});

test("cada error con campo señala ese campo y dice si está en Configuración avanzada", () => {
  assert.deepEqual(fieldForError("capacity"), { field: "capacity", advanced: true });
  assert.deepEqual(fieldForError("capacityInvalid"), { field: "capacity", advanced: true });
  for (const code of ["capacitySidesInvalid", "capacityHeaders", "capacityHeelers", "capacityEach"]) assert.deepEqual(fieldForError(code), { field: "capacity", advanced: true }, code);
  assert.deepEqual(fieldForError("invalidShots"), { field: "shotsPerPackage", advanced: false });
  assert.deepEqual(fieldForError("drawLocked"), { field: "drawType", advanced: false });
  assert.deepEqual(fieldForError("ratingLimit"), { field: "maxRoperRating", advanced: true });
  assert.deepEqual(fieldForError("invalidRounds"), { field: "rounds", advanced: false });
  assert.deepEqual(fieldForError("roundsLocked"), { field: "rounds", advanced: false });
  assert.deepEqual(fieldForError("shortGoMin"), { field: "rounds", advanced: false });
  assert.deepEqual(fieldForError("closeAfterEvent"), { field: "closesOn", advanced: true });
  assert.deepEqual(fieldForError("opensAfterClose"), { field: "opensOn", advanced: true });
  assert.deepEqual(fieldForError("eventTimeInvalid"), { field: "eventTime", advanced: false });
  assert.deepEqual(fieldForError("catInUse"), { field: "catName", advanced: true });
});

test("un error general («faltan datos») o desconocido no señala ningún campo", () => {
  assert.equal(fieldForError("1"), undefined);
  assert.equal(fieldForError("algo-nuevo"), undefined);
  assert.equal(fieldForError(undefined), undefined);
});

test("el selector de foco de la arena cubre el selector de arenas y los campos de sede y ciudad", () => {
  assert.equal(focusSelector("rounds"), '[name="rounds"]');
  assert.match(focusSelector("arena"), /arenaId/);
  assert.match(focusSelector("arena"), /venue/);
  assert.match(focusSelector("capacity"), /capacityEach/); // el cupo se enfoca en el campo que esté visible
});

test("el estado inicial no trae error ni valores", () => {
  assert.deepEqual(INITIAL_EVENT_FORM_STATE, { attempt: 0 });
});
