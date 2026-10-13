// Sonda zgodnosci z API KRS: trojstan + `actionable`, na lokalnej atrapie (zero sieci).
// Wzorzec soba-labs/krs-mcp #2. Dane wylacznie spolki; sklad organow pusty.
// Run: npm run test:unit (wymaga npm run build)

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { sonduj, KOD_WYJSCIA, PRZYPADKI } from "./sonda.mjs";

const NAGLOWEK = { rejestr: "RejP", numerKRS: "0000028860", dataCzasOdpisu: "01.10.2026 12:00:00" };
const aktualny = (status6) => ({
  odpis: {
    rodzaj: "Aktualny",
    naglowekA: NAGLOWEK,
    dane: {
      dzial1: { danePodmiotu: { formaPrawna: "SPOLKA AKCYJNA", nazwa: "ORLEN SPOLKA AKCYJNA",
        identyfikatory: { nip: "7740001454", regon: "61018820100000" } } },
      dzial2: { reprezentacja: { nazwa: "ZARZAD", sklad: [] } },
      ...(status6 && { dzial6: status6 }),
    },
  },
});
// Ksztalt odpisu pelnego zmierzony na zywo 2026-10-13: tablice historii + pusty kontener dzialu 6.
const pelny = {
  odpis: {
    rodzaj: "Pelny",
    naglowekP: NAGLOWEK,
    dane: {
      dzial1: { danePodmiotu: {
        formaPrawna: [{ formaPrawna: "SPOLKA AKCYJNA", nrWpisuWprow: "1" }],
        identyfikatory: [{ identyfikatory: { nip: "7740001454", regon: "61018820100000" }, nrWpisuWprow: "1" }],
        nazwa: [{ nazwa: "STARA NAZWA", nrWpisuWprow: "1", nrWpisuWykr: "2" }, { nazwa: "ORLEN SPOLKA AKCYJNA", nrWpisuWprow: "2" }],
      } },
      dzial6: { rozwiazanieUniewaznienie: { okreslenieOkolicznosci: [] } },
    },
  },
};

async function zAtrapa(obsluga, fn) {
  const s = http.createServer((req, res) => {
    const [status, ct, body] = obsluga(req);
    res.writeHead(status, { "content-type": ct });
    res.end(body);
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    return await fn({ ...process.env, KRS_BASE_URL: `http://127.0.0.1:${s.address().port}/api/krs` });
  } finally {
    s.close();
  }
}
const json = (o) => [200, "application/json", JSON.stringify(o)];
const zdrowe = (req) => (req.url.includes("OdpisPelny") ? json(pelny) : json(aktualny()));

test("zdrowe zrodlo -> OK, pelny mianownik (takze odpis pelny = aktywny)", async () => {
  const w = await zAtrapa(zdrowe, (env) => sonduj({ env }));
  assert.equal(w.status, "OK", JSON.stringify(w.kontrole));
  assert.equal(w.kontrole.length, PRZYPADKI.length);
  assert.equal(KOD_WYJSCIA[w.status], 0);
});

test("503 -> UWAGI, nie budzi czlowieka", async () => {
  const w = await zAtrapa(() => [503, "text/html", "<html>busy</html>"], (env) => sonduj({ env }));
  assert.equal(w.status, "UWAGI", JSON.stringify(w.kontrole));
  assert.equal(w.actionable, false);
});

test("403 -> BLOKADA, budzi czlowieka", async () => {
  const w = await zAtrapa(() => [403, "text/html", "<html>Forbidden</html>"], (env) => sonduj({ env }));
  assert.equal(w.status, "BLOKADA");
  assert.equal(w.actionable, true);
});

test("zmiana statusu znanej spolki (likwidacja) -> BLOKADA", async () => {
  const w = await zAtrapa(
    (req) => (req.url.includes("OdpisPelny") ? json(pelny)
      : json(aktualny({ likwidacja: { okreslenieOkolicznosci: "UCHWALA O LIKWIDACJI" } }))),
    (env) => sonduj({ env }),
  );
  assert.equal(w.status, "BLOKADA");
});

test("pusta lista przypadkow = BLOKADA, nie sukces", async () => {
  assert.equal((await sonduj({ przypadki: [] })).status, "BLOKADA");
});
