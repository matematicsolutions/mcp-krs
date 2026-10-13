// E2E przez protokol MCP: zbudowany serwer (dist/) + lokalna atrapa API KRS (KRS_BASE_URL).
//
// Sprawdza to, co naprawde dostaje agent - nie funkcje w izolacji.
// Fikstura: wylacznie dane SPOLKI (rekord publiczny duzej spolki gieldowej), sklad organow
// pusty - zadnych danych osob fizycznych w repo.
// Run: npm run test:unit (wymaga npm run build)

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CZAS_ODPISU = "01.10.2026 12:00:00";

function odpis({ zCzasem = true } = {}) {
  return {
    odpis: {
      rodzaj: "Aktualny",
      naglowekA: {
        rejestr: "RejP",
        numerKRS: "0000028860",
        ...(zCzasem && { dataCzasOdpisu: CZAS_ODPISU }),
        stanZDnia: "30.09.2026",
      },
      dane: {
        dzial1: {
          danePodmiotu: {
            formaPrawna: "SPOLKA AKCYJNA",
            identyfikatory: { nip: "7740001454", regon: "61018820100000" },
            nazwa: "ORLEN SPOLKA AKCYJNA",
          },
          siedzibaIAdres: { adres: { miejscowosc: "PLOCK", kodPocztowy: "09-411" } },
        },
        dzial2: { reprezentacja: { nazwa: "ZARZAD", sklad: [] } },
      },
    },
  };
}

/** Atrapa API KRS. `odpowiedz(req)` -> [status, naglowki, cialo]; licznik zapytan w `ile()`. */
async function atrapa(odpowiedz) {
  let licznik = 0;
  const s = http.createServer((req, res) => {
    licznik++;
    const [status, naglowki, body] = odpowiedz(req);
    res.writeHead(status, naglowki);
    res.end(body);
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${s.address().port}/api/krs`,
    ile: () => licznik,
    zamknij: () => s.close(),
  };
}

const JSON_OK = (obj) => () => [200, { "content-type": "application/json" }, JSON.stringify(obj)];

async function klient(base) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "index.js")],
    env: { ...process.env, KRS_BASE_URL: base },
    stderr: "ignore",
  });
  const c = new Client({ name: "e2e-atrapa", version: "1.0" });
  await c.connect(transport);
  return c;
}

async function zAtrapa(odpowiedz, fn) {
  const a = await atrapa(odpowiedz);
  const c = await klient(a.base);
  try {
    await fn(c, a);
  } finally {
    await c.close();
    a.zamknij();
  }
}

// Wzorzec soba-labs/krs-mcp #1 (`src/tools/common.ts:38-51`): blok provenance w KAZDYM udanym
// wyniku - zrodlo, czas pobrania, czas wytworzenia i co zrobil konektor. Pod warunki ponownego
// wykorzystania informacji sektora publicznego. KRS, inaczej niz SAOS, PODAJE czas wytworzenia
// odpisu (`naglowek.dataCzasOdpisu`) - przepisujemy go doslownie, bez zgadywania strefy.
const WYWOLANIA = {
  get_entity: { krs: "28860" },
  get_entity_full: { krs: "28860" },
  get_board: { krs: "28860" },
};

test("provenance w kazdym udanym wyniku - pelny mianownik narzedzi", async () => {
  await zAtrapa(JSON_OK(odpis()), async (c, a) => {
    const narzedzia = (await c.listTools()).tools.map((t) => t.name).sort();
    assert.ok(narzedzia.length > 0, "pusta lista narzedzi = BLOKADA");
    assert.deepEqual(narzedzia, Object.keys(WYWOLANIA).sort(), "kazde narzedzie musi miec wywolanie");
    for (const [name, args] of Object.entries(WYWOLANIA)) {
      const r = await c.callTool({ name, arguments: args });
      assert.notEqual(r.isError, true, `${name}: ${r.content?.[0]?.text}`);
      const p = r.structuredContent?.provenance;
      assert.ok(p, `${name}: brak provenance`);
      assert.ok(p.source && String(p.source).startsWith(a.base), `${name}: source = ${p.source}`);
      assert.match(String(p.source), /\/0000028860\?rejestr=P/, `${name}: source bez numeru KRS`);
      assert.ok(!Number.isNaN(Date.parse(p.retrieved_at)), `${name}: retrieved_at = ${p.retrieved_at}`);
      assert.equal(p.source_produced_at, CZAS_ODPISU, `${name}: source_produced_at`);
      assert.ok(p.processing && p.processing.length > 10, `${name}: processing`);
    }
  });
});

// Wzorzec soba-labs/krs-mcp #4 (`AGENTS.md:43`, `src/health-check.ts:33-38`): 401/403 od zrodla
// = zmiana zabezpieczen, przeglad czlowieka. Kod `forbidden`, retryable false, JEDNO zapytanie
// (zadnego ponawiania ani obchodzenia). Do 2026-10-13: `upstream_error` "Sprobuj ponownie".
for (const status of [401, 403]) {
  test(`${status} od zrodla -> forbidden, retryable false, bez ponawiania`, async () => {
    const odmowa = () => [status, { "content-type": "application/json" }, '{"status":' + status + "}"];
    await zAtrapa(odmowa, async (c, a) => {
      const r = await c.callTool({ name: "get_entity", arguments: { krs: "28860" } });
      assert.equal(r.isError, true);
      assert.equal(r.structuredContent.error_code, "forbidden");
      assert.equal(r.structuredContent.retryable, false);
      assert.equal(r.structuredContent.fault, "upstream");
      assert.doesNotMatch(r.content[0].text, /Sprobuj ponownie/);
      assert.equal(a.ile(), 1, "forbidden nie moze byc ponawiany");
    });
  });
}

test("HTML/200 zamiast JSON -> upstream_shape, nie 'sprobuj ponownie'", async () => {
  const strona = () => [200, { "content-type": "text/html" }, "<!DOCTYPE html><html><body>Przerwa</body></html>"];
  await zAtrapa(strona, async (c) => {
    const r = await c.callTool({ name: "get_board", arguments: { krs: "28860" } });
    assert.equal(r.isError, true);
    assert.equal(r.structuredContent.error_code, "upstream_shape");
    assert.equal(r.structuredContent.retryable, false);
    assert.doesNotMatch(r.content[0].text, /Unexpected token|is not valid JSON/);
  });
});

test("200 + JSON bez `odpis` (zmiana kontraktu) -> upstream_shape, NIE not_found", async () => {
  await zAtrapa(JSON_OK({ cosInnego: true }), async (c) => {
    const r = await c.callTool({ name: "get_entity", arguments: { krs: "28860" } });
    assert.equal(r.isError, true);
    assert.equal(r.structuredContent.error_code, "upstream_shape");
  });
});

test("5xx -> upstream_unavailable (retryable), 429 -> rate_limited z retry_after_s", async () => {
  await zAtrapa(() => [503, { "content-type": "text/plain" }, "busy"], async (c) => {
    const r = await c.callTool({ name: "get_entity", arguments: { krs: "28860" } });
    assert.equal(r.structuredContent.error_code, "upstream_unavailable");
    assert.equal(r.structuredContent.retryable, true);
  });
  await zAtrapa(() => [429, { "content-type": "text/plain", "retry-after": "120" }, ""], async (c) => {
    const r = await c.callTool({ name: "get_entity", arguments: { krs: "28860" } });
    assert.equal(r.structuredContent.error_code, "rate_limited");
    assert.equal(r.structuredContent.retry_after_s, 30, "sufit 30 s");
  });
});

test("kontrola pozytywna: 404 JSON (zmierzone na zywo) -> not_found z wina caller", async () => {
  const brak = () => [404, { "content-type": "application/json; charset=utf-8" }, '{"status":404}'];
  await zAtrapa(brak, async (c) => {
    const r = await c.callTool({ name: "get_entity", arguments: { krs: "1" } });
    assert.equal(r.isError, true);
    assert.equal(r.structuredContent.error_code, "not_found");
    assert.equal(r.structuredContent.fault, "caller");
    assert.match(r.content[0].text, /drugi rejestr/);
  });
});

test("provenance: zrodlo bez czasu odpisu -> source_produced_at jawne null", async () => {
  await zAtrapa(JSON_OK(odpis({ zCzasem: false })), async (c) => {
    const r = await c.callTool({ name: "get_entity", arguments: { krs: "28860" } });
    assert.notEqual(r.isError, true, r.content?.[0]?.text);
    assert.equal(r.structuredContent.provenance.source_produced_at, null);
  });
});
