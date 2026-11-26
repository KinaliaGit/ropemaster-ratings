import test from "node:test";
import assert from "node:assert/strict";
import { directorySearch, parseDirectoryQuery, toDirectoryPage, wordStartPattern } from "../src/lib/roper-directory.ts";

const parse = (query) => parseDirectoryQuery(new URL(`https://ratings.example.com/api/directorio${query}`), ["lazo"]);
const row = (n, ratings = [{ rating: "4.5" }]) => ({ id: `id-${n}`, full_name: `Persona ${n}`, avatar_path: null, primary_role: "both", roper_ratings: ratings });

test("sin filtros solo hace falta la modalidad", () => {
  const p = parse("?discipline=lazo&role=&q=&after=");
  assert.deepEqual(p.ok && p.value, { discipline: "lazo", search: "", role: null, offset: 0 });
});

test("modalidad, posición y página se validan", () => {
  for (const bad of ["", "?discipline=hack", "?discipline=lazo&role=both", "?discipline=lazo&after=0", "?discipline=lazo&after=abc"]) assert.equal(parse(bad).ok, false, bad);
  const p = parse(`?discipline=lazo&role=heeler&after=60&q=${"a".repeat(100)}`);
  assert.equal(p.ok && p.value.role, "heeler");
  assert.equal(p.ok && p.value.offset, 60);
  assert.equal(p.ok && p.value.search.length, 60);
});

test("un ID corto se busca por número; lo demás, por palabras", () => {
  assert.deepEqual(directorySearch("  RM-0042 "), { rm: 42 });
  assert.deepEqual(directorySearch("rm7"), { rm: 7 });
  assert.deepEqual(directorySearch("Ana  Rodríguez ana"), { words: ["ana", "rodríguez"] });
  assert.deepEqual(directorySearch(""), { words: [] });
  assert.equal(directorySearch("a b c d e f g").words.length, 5);
});

test("nada de lo escrito se cuela como sintaxis del filtro", () => {
  assert.deepEqual(directorySearch('x),id.eq.1 %_* "o\'neil"'), { words: ["xideq1", "o'neil"] });
});

test("una fila de más indica otra página; quien no tiene número parte del inicial", () => {
  const more = toDirectoryPage([row(1), row(2, []), row(3)], 2, 60, 1);
  assert.deepEqual(more.rows.map((r) => r.rating), [4.5, 1]);
  assert.equal(more.next, 62);
  assert.equal(toDirectoryPage([row(1, null)], 2, 0, 1).next, null);
});

test("la búsqueda ignora acentos y mayúsculas, y solo por inicio de palabra", () => {
  const find = (word, name) => new RegExp(wordStartPattern(word), "i").test(name);
  assert.equal(find("rodri", "Ana Paola Estrada Rodríguez"), true);
  assert.equal(find("rodrí", "Ana Rodriguez"), true);
  assert.equal(find("oscar", "Óscar Núñez"), true);
  assert.equal(find("nunez", "Óscar Núñez"), true);
  assert.equal(find("driguez", "Ana Rodríguez"), false);
});
