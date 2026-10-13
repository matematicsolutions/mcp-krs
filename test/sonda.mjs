#!/usr/bin/env node
// Sonda zgodnosci ze zrodlem: znany, waski, publiczny rekord + trojstan i flaga `actionable`.
//
// Wzorzec soba-labs/krs-mcp #2 (`src/health-check.ts`). CI i smoke sprawdzaja NASZ kod; sonda
// sprawdza, czy ZRODLO nadal mowi tym samym jezykiem. Idzie przez protokol MCP do zbudowanego
// serwera (dist/), wiec widzi dokladnie to, co agent. Klasyfikacja:
//   OK      (exit 0)  - wszystkie kontrole zgodne
//   UWAGI   (exit 10) - wylacznie awarie chwilowe (`retryable: true` albo kod z CHWILOWE) - nie budzi
//   BLOKADA (exit 20) - zmiana kontraktu rekordu, 403, nieznany ksztalt - budzi czlowieka
// Pusta lista kontroli = BLOKADA, nie sukces. 403 = przeglad czlowieka, nigdy obchodzenie.
//
// Run: npm run build && node test/sonda.mjs   (codziennie: .github/workflows/sonda-zgodnosci.yml)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const KOD_WYJSCIA = { OK: 0, UWAGI: 10, BLOKADA: 20 };

// --- konfiguracja per konektor ------------------------------------------------------------
// mcp-krs niesie `retryable` - chwilowe rozpoznajemy po nim; lista dodatkowa pusta.
export const CHWILOWE = new Set();

// Rekord publiczny zmierzony na zywo 2026-10-13: KRS 0000028860 (spolka gieldowa), NIP 7740001454,
// status aktywny. Odpis pelny tez ma dac "aktywny" - strazni regresji falszywego "rozwiazana" (1.1.2).
const zgodna = (r) => {
  const c = r.structuredContent?.citations?.[0];
  if (!c) return "brak citation";
  if (c.krs !== "0000028860") return `krs: jest ${c.krs}`;
  if (c.nip !== "7740001454") return `nip: oczekiwano 7740001454, jest ${c.nip}`;
  if (c.status !== "aktywny") return `status: oczekiwano aktywny, jest ${c.status}`;
  return null;
};
export const PRZYPADKI = [
  { nazwa: "get_entity 0000028860", tool: "get_entity", args: { krs: "28860" }, sprawdz: zgodna },
  { nazwa: "get_entity_full 0000028860", tool: "get_entity_full", args: { krs: "28860" }, sprawdz: zgodna },
];
// ------------------------------------------------------------------------------------------

export async function sonduj({ env = process.env, przypadki = PRZYPADKI } = {}) {
  if (!przypadki.length) {
    return { status: "BLOKADA", actionable: true, kontrole: [{ kontrola: "mianownik", ok: false, opis: "zero kontroli" }] };
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "index.js")],
    env: { ...env },
    stderr: "ignore",
  });
  const c = new Client({ name: "sonda-zgodnosci", version: "1" });
  await c.connect(transport);
  const kontrole = [];
  try {
    for (const p of przypadki) {
      try {
        const r = await c.callTool({ name: p.tool, arguments: p.args });
        if (r.isError) {
          const kod = r.structuredContent?.error_code ?? "nieznany";
          const chwilowe = r.structuredContent?.retryable === true || CHWILOWE.has(kod);
          kontrole.push({ kontrola: p.nazwa, ok: false, kod, chwilowe, opis: (r.content?.[0]?.text ?? "").slice(0, 200) });
          continue;
        }
        const blad = p.sprawdz(r);
        kontrole.push({ kontrola: p.nazwa, ok: blad === null, chwilowe: false, opis: blad ?? "zgodne" });
      } catch (e) {
        kontrole.push({ kontrola: p.nazwa, ok: false, kod: "internal_error", chwilowe: false, opis: String(e).slice(0, 200) });
      }
    }
  } finally {
    await c.close();
  }
  const nieudane = kontrole.filter((k) => !k.ok);
  if (!nieudane.length) return { status: "OK", actionable: false, kontrole };
  if (nieudane.every((k) => k.chwilowe)) return { status: "UWAGI", actionable: false, kontrole };
  return { status: "BLOKADA", actionable: true, kontrole };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = await sonduj();
  console.log(JSON.stringify(w, null, 2));
  process.exit(KOD_WYJSCIA[w.status]);
}
