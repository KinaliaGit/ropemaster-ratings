import test from "node:test";
import assert from "node:assert/strict";
import { matchesEvent, matchesName, parseSearch } from "../src/lib/search.ts";

const event = { name: "Las Tunas Thanksgiving", venue: "Lienzo San José", city: "Chihuahua", date: "2026-11-21" };

test("KIN-768: un evento se encuentra por nombre, arena, ciudad o fecha, sin acentos ni mayúsculas", () => {
  for (const q of ["tunas", "THANKS", "jose", "chih", "noviembre", "nov 2026", "november", "21 nov", "tunas chihuahua", ""]) assert.equal(matchesEvent(event, q), true, q);
});

test("no encuentra por mitad de palabra ni lo que no está", () => {
  for (const q of ["unas", "diciembre", "monterrey", "tunas monterrey"]) assert.equal(matchesEvent(event, q), false, q);
});

test("un evento sin fecha ni arena no rompe la búsqueda", () => {
  assert.equal(matchesEvent({ name: "Prueba", venue: "", city: "", date: "" }, "prueba"), true);
});

test("el lazador se busca por inicio de palabra", () => {
  assert.equal(matchesName("Ana Paola Estrada Rodríguez", "rodri ana"), true);
  assert.equal(matchesName("Mateo Villarreal", "teo"), false);
});

test("la búsqueda de la URL se recorta y se limita", () => {
  assert.equal(parseSearch("  ana  "), "ana");
  assert.equal(parseSearch("a".repeat(200)).length, 80);
  for (const bad of [undefined, null, ["a"], 3]) assert.equal(parseSearch(bad), "");
});
