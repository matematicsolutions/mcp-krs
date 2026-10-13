// Klasyfikacja odpowiedzi API KRS i katalog KODY - bez sieci, bez serwera stdio.
// Run: npm run test:unit (wymaga npm run build)

import test from "node:test";
import assert from "node:assert/strict";

import { klasyfikuj, bladJakoWynik, KrsError, KODY } from "../dist/krs-http.js";

const U = "http://atrapa/OdpisAktualny/0000028860";
const kod = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof KrsError ? e.code : `obcy:${e}`;
  }
  return "brak-wyjatku";
};

test("klasyfikuj: kazdy status ma nazwany kod, 404 -> null", () => {
  assert.equal(klasyfikuj(U, 404, "application/json", "{}"), null);
  assert.equal(kod(() => klasyfikuj(U, 401, "application/json", "{}")), "forbidden");
  assert.equal(kod(() => klasyfikuj(U, 403, "text/html", "<html>")), "forbidden");
  assert.equal(kod(() => klasyfikuj(U, 429, "text/plain", "")), "rate_limited");
  assert.equal(kod(() => klasyfikuj(U, 500, "text/plain", "")), "upstream_unavailable");
  assert.equal(kod(() => klasyfikuj(U, 302, "text/html", "")), "upstream_error");
  assert.equal(kod(() => klasyfikuj(U, 200, "text/html", "<html>")), "upstream_shape");
  assert.equal(kod(() => klasyfikuj(U, 200, "application/json", "{zepsuty")), "upstream_shape");
  assert.deepEqual(klasyfikuj(U, 200, "application/json; charset=utf-8", '{"odpis":{}}'), { odpis: {} });
});

test("forbidden: nie-ponawialny, wina zrodla, tekst zakazuje obchodzenia zabezpieczen", () => {
  const w = bladJakoWynik(new KrsError("forbidden", "odmowa (403)", { status: 403 }));
  assert.equal(w.isError, true);
  assert.deepEqual(w.structuredContent, { error_code: "forbidden", fault: "upstream", retryable: false, status: 403 });
  assert.match(w.content[0].text, /^\[forbidden\] /);
  assert.match(w.content[0].text, /nie obchodz zabezpieczen/);
});

test("wyjatek spoza zrodla (bug konektora) -> internal_error z wina server, nie 'sprobuj ponownie'", () => {
  const w = bladJakoWynik(new TypeError("Cannot read properties of undefined"));
  assert.equal(w.structuredContent.error_code, "internal_error");
  assert.equal(w.structuredContent.fault, "server");
  assert.equal(w.structuredContent.retryable, false);
  assert.doesNotMatch(w.content[0].text, /Sprobuj ponownie/i);
});

test("Retry-After: sufit 30 s, smieci -> brak pola", () => {
  const ra = (h) => {
    try {
      klasyfikuj(U, 429, "text/plain", "", h);
    } catch (e) {
      return e.retryAfterS;
    }
  };
  assert.equal(ra("5"), 5);
  assert.equal(ra("3600"), 30);
  assert.equal(ra("Wed, 21 Oct 2026 07:28:00 GMT"), undefined);
});

test("KODY: ponawialne sa tylko awarie przejsciowe", () => {
  const ponawialne = Object.entries(KODY).filter(([, v]) => v.retryable).map(([k]) => k).sort();
  assert.deepEqual(ponawialne, ["rate_limited", "upstream_unavailable"]);
});
