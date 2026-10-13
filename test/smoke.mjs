#!/usr/bin/env node
// Zywy smoke: kazde narzedzie z tools/list ma przypadek na prawdziwym API KRS (pelny mianownik).
//
// Rekord: wylacznie duza spolka gieldowa (KRS 0000028860). Skrypt NIE wypisuje tresci odpisu
// (dzial 2 to osoby fizyczne) - tylko PASS/FAIL i powod.
// Celowo poza `npm test` i poza wydaniem: awaria zrodla nie blokuje NASZEGO wydania.
// Run: npm run build && npm run smoke

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPOLKA = "28860";
const ZRODLO = "https://api-krs.ms.gov.pl/api/krs/";

const env = { ...process.env };
delete env.KRS_BASE_URL; // smoke ma isc na ZYWE zrodlo, nie na atrape
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(ROOT, "dist", "index.js")],
  env,
  stderr: "ignore",
});
const c = new Client({ name: "smoke-krs", version: "1.0" });
await c.connect(transport);

/** Wspolne asercje udanego wyniku; zwraca liste powodow FAIL (pusta = PASS). */
function sprawdzUdany(r) {
  const p = [];
  if (r.isError) return [`isError: ${String(r.content?.[0]?.text).slice(0, 120)}`];
  const txt = String(r.content?.[0]?.text ?? "");
  const cit = r.structuredContent?.citations?.[0];
  const prov = r.structuredContent?.provenance;
  if (!txt) p.push("pusty tekst");
  if (/\[object Object\]/.test(txt)) p.push("tekst zawiera [object Object] (zly schemat odpisu)");
  if (!cit) p.push("brak citations");
  else if (/\[object Object\]/.test(String(cit.title))) p.push("citation.title = [object Object]");
  if (!prov) p.push("brak provenance");
  else {
    if (!String(prov.source).startsWith(ZRODLO)) p.push(`provenance.source = ${prov.source}`);
    if (Number.isNaN(Date.parse(prov.retrieved_at))) p.push("provenance.retrieved_at");
    if (!/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/.test(String(prov.source_produced_at)))
      p.push(`provenance.source_produced_at = ${prov.source_produced_at}`);
  }
  return p;
}

const wyniki = [];
const zapisz = (nazwa, narzedzie, powody) => {
  wyniki.push({ nazwa, narzedzie, ok: powody.length === 0 });
  console.log(`${powody.length ? "FAIL" : "PASS"}  ${nazwa}${powody.length ? "\n      - " + powody.join("\n      - ") : ""}`);
};

let statusAktualny;
{
  const r = await c.callTool({ name: "get_entity", arguments: { krs: SPOLKA } });
  const p = sprawdzUdany(r);
  statusAktualny = r.structuredContent?.citations?.[0]?.status;
  if (!statusAktualny) p.push("brak statusu w citation");
  zapisz("get_entity: odpis aktualny spolki gieldowej", "get_entity", p);
}
{
  const r = await c.callTool({ name: "get_entity_full", arguments: { krs: SPOLKA } });
  const p = sprawdzUdany(r);
  const st = r.structuredContent?.citations?.[0]?.status;
  if (statusAktualny && st !== statusAktualny)
    p.push(`status z odpisu pelnego (${st}) != status z aktualnego (${statusAktualny})`);
  zapisz("get_entity_full: odpis pelny tej samej spolki", "get_entity_full", p);
}
{
  const r = await c.callTool({ name: "get_board", arguments: { krs: SPOLKA } });
  const p = sprawdzUdany(r);
  if (!/^=== Reprezentacja KRS 0000028860/.test(String(r.content?.[0]?.text))) p.push("brak naglowka reprezentacji");
  zapisz("get_board: reprezentacja spolki gieldowej", "get_board", p);
}
{
  const r = await c.callTool({ name: "get_entity", arguments: { krs: "1" } });
  const p = [];
  if (r.isError !== true) p.push("nieistniejacy KRS nie dal isError");
  if (r.structuredContent?.error_code !== "not_found") p.push(`error_code = ${r.structuredContent?.error_code}`);
  if (r.structuredContent?.fault !== "caller") p.push(`fault = ${r.structuredContent?.fault}`);
  zapisz("get_entity: nieistniejacy KRS -> not_found (404 zrodla)", "get_entity", p);
}

// Pelny mianownik: kazde narzedzie z tools/list musi miec przypadek zywy; pusta lista = BLOKADA.
const narzedzia = (await c.listTools()).tools.map((t) => t.name).sort();
const pokryte = [...new Set(wyniki.map((w) => w.narzedzie))].sort();
const brakujace = narzedzia.filter((n) => !pokryte.includes(n));
zapisz(
  `mianownik: ${pokryte.length}/${narzedzia.length} narzedzi z przypadkiem zywym`,
  "-",
  narzedzia.length === 0 ? ["tools/list pusty = BLOKADA"] : brakujace.map((n) => `brak przypadku: ${n}`),
);

await c.close();
const fail = wyniki.filter((w) => !w.ok).length;
console.log(`\nsmoke: ${wyniki.length - fail}/${wyniki.length} PASS`);
process.exit(fail ? 1 : 0);
