// Odpis pelny KRS: falszywe fakty bez bledu (zmierzone na zywo 2026-10-13, defekt na main).
//
// Dla aktywnej spolki gieldowej `get_entity_full` zwracal status "rozwiazana", nazwe
// "[object Object],[object Object]" i NIP/REGON "?" - a `get_entity` ten sam KRS: "aktywny".
// Przyczyny (pomiar ksztaltu, bez tresci odpisu):
// 1. w odpisie pelnym pola sa TABLICAMI HISTORII: nazwa = [{nazwa, nrWpisuWprow, nrWpisuWykr}, ...],
//    biezacy wpis = bez `nrWpisuWykr`; formatter odpisu aktualnego drukowal tablice;
// 2. `dzial6.rozwiazanieUniewaznienie` istnieje jako PUSTY kontener
//    `{ okreslenieOkolicznosci: [] }`, a `detectStatus` sprawdzal samo istnienie obiektu.
// Odpis pelny ma ~430 KB - surowego JSON-a nie oddamy, wiec wynik jest uczciwie `degraded`.
// Fikstura: wylacznie dane spolki, wartosci fikcyjne; zadnych danych osob.
// Run: npm run test:unit (wymaga npm run build)

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function pelny({ dzial6 } = {}) {
  return {
    odpis: {
      rodzaj: "Pelny",
      naglowekP: { rejestr: "RejP", numerKRS: "0000000001", dataCzasOdpisu: "01.10.2026 12:00:00" },
      dane: {
        dzial1: {
          danePodmiotu: {
            formaPrawna: [{ formaPrawna: "SPOLKA AKCYJNA", nrWpisuWprow: "1" }],
            identyfikatory: [
              { identyfikatory: { nip: "1111111111", regon: "111111111" }, nrWpisuWprow: "1", nrWpisuWykr: "5" },
              { identyfikatory: { nip: "2222222222", regon: "222222222" }, nrWpisuWprow: "5" },
            ],
            nazwa: [
              { nazwa: "STARA NAZWA SPOLKA AKCYJNA", nrWpisuWprow: "1", nrWpisuWykr: "7" },
              { nazwa: "NOWA NAZWA SPOLKA AKCYJNA", nrWpisuWprow: "7" },
            ],
          },
        },
        ...(dzial6 === undefined
          ? { dzial6: { rozwiazanieUniewaznienie: { okreslenieOkolicznosci: [] } } }
          : dzial6 === null
            ? {}
            : { dzial6 }),
      },
    },
  };
}

async function wywolaj(cialo, name = "get_entity_full") {
  const s = http.createServer((_q, r) => {
    r.writeHead(200, { "content-type": "application/json" });
    r.end(JSON.stringify(cialo));
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const t = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "index.js")],
    env: { ...process.env, KRS_BASE_URL: `http://127.0.0.1:${s.address().port}/api/krs` },
    stderr: "ignore",
  });
  const c = new Client({ name: "odpis-pelny", version: "1" });
  await c.connect(t);
  try {
    return await c.callTool({ name, arguments: { krs: "1" } });
  } finally {
    await c.close();
    s.close();
  }
}

test("odpis pelny: biezace wartosci z historii, nie [object Object]", async () => {
  const r = await wywolaj(pelny());
  const tekst = r.content[0].text;
  assert.doesNotMatch(tekst, /\[object Object\]/);
  assert.match(tekst, /NOWA NAZWA SPOLKA AKCYJNA/);
  assert.match(tekst, /2222222222/);
  assert.doesNotMatch(tekst, /NIP\s*:\s*\?/);
  assert.equal(r.structuredContent.citations[0].title.includes("NOWA NAZWA"), true);
});

test("pusty kontener rozwiazanieUniewaznienie to NIE rozwiazanie", async () => {
  const r = await wywolaj(pelny());
  assert.match(r.content[0].text, /Status\s*:\s*aktywny/);
});

test("odpis pelny nie udaje kompletnosci: degraded + Wynik niepelny na czele", async () => {
  const r = await wywolaj(pelny());
  assert.equal(r.structuredContent.status, "degraded");
  assert.ok(r.structuredContent.partial_result?.jak_uzupelnic);
  assert.match(r.content[0].text, /^Wynik niepelny: /);
});

test("kontrola pozytywna: biezacy wpis o rozwiazaniu -> rozwiazana", async () => {
  const r = await wywolaj(pelny({
    dzial6: { rozwiazanieUniewaznienie: { okreslenieOkolicznosci: [{ okreslenieOkolicznosci: "UCHWALA O ROZWIAZANIU", nrWpisuWprow: "9" }] } },
  }));
  assert.match(r.content[0].text, /Status\s*:\s*rozwiazana/);
});

test("wpis o rozwiazaniu WYKRESLONY -> nie rozwiazana", async () => {
  const r = await wywolaj(pelny({
    dzial6: { rozwiazanieUniewaznienie: { okreslenieOkolicznosci: [{ okreslenieOkolicznosci: "X", nrWpisuWprow: "9", nrWpisuWykr: "10" }] } },
  }));
  assert.match(r.content[0].text, /Status\s*:\s*aktywny/);
});

test("odpis aktualny z pustym kontenerem dzialu 6 -> aktywny", async () => {
  const aktualny = {
    odpis: {
      rodzaj: "Aktualny",
      naglowekA: { rejestr: "RejP", numerKRS: "0000000001", dataCzasOdpisu: "01.10.2026 12:00:00" },
      dane: {
        dzial1: { danePodmiotu: { formaPrawna: "SPOLKA AKCYJNA", nazwa: "SPOLKA TESTOWA SA",
          identyfikatory: { nip: "2222222222", regon: "222222222" } } },
        dzial6: { likwidacja: {} },
      },
    },
  };
  const r = await wywolaj(aktualny, "get_entity");
  assert.match(r.content[0].text, /Status\s*:\s*aktywny/);
});
