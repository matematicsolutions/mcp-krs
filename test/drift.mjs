#!/usr/bin/env node
// Drift test - INSTRUCTIONS spojne z TOOLS i typem ErrorCode.
// Pattern z dograh v1.31.0 (BSD-2) via mcp-eu-compliance v0.2.0.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf-8");

const failures = [];

// Koniec literalu = pierwszy NIEescapowany backtick. Do 2026-10-13 `([\s\S]*?)`;` konczylo
// sie na pierwszym "\`;" wewnatrz tekstu i po cichu ucinalo reszte INSTRUCTIONS.
const instructionsMatch = SRC.match(/const INSTRUCTIONS = `((?:\\[\s\S]|[^`\\])*)`;/);
if (!instructionsMatch) {
    failures.push("Nie znaleziono const INSTRUCTIONS w src/index.ts");
} else {
    const instructions = instructionsMatch[1];

    const toolsBlock = SRC.match(/const TOOLS\s*=\s*\[([\s\S]*?)\]\s*as const;|const TOOLS\s*=\s*\[([\s\S]*?)\];/);
    const toolsSource = toolsBlock ? (toolsBlock[1] || toolsBlock[2] || "") : SRC;
    const toolsMatches = [...toolsSource.matchAll(/name:\s*"([a-z][a-z0-9_]+)"/g)];
    const registered = new Set(toolsMatches.map((m) => m[1]));

    const referenced = new Set();
    for (const m of instructions.matchAll(/`([a-z][a-z0-9_]{3,})`/g)) {
        const skip = new Set([
            "isError", "true", "false", "null", "undefined", "structuredContent",
        ]);
        if (!skip.has(m[1])) referenced.add(m[1]);
    }

    for (const ref of referenced) {
        const looksLikeTool = ref.includes("_") || registered.has(ref);
        if (!looksLikeTool) continue;
        if (!registered.has(ref)) {
            failures.push(
                `INSTRUCTIONS referencuje tool '${ref}' ktorego nie ma w TOOLS. ` +
                    `Registered: ${[...registered].sort().join(", ")}`,
            );
        }
    }
}

// -----------------------------------------------------------------------------
// Kody bledow: jedno zrodlo prawdy = `export type KrsErrorCode` + tabela KODY w
// src/krs-http.ts (2026-10-13; wczesniej typ w index.ts i jeden kod awarii zrodla
// `upstream_error` dla 401/403, 5xx, HTML/200 i bugow konektora). Sprawdzane w obie strony.
// -----------------------------------------------------------------------------

if (!/type ErrorCode\s*=\s*KrsErrorCode\s*;/.test(SRC)) {
    failures.push("type ErrorCode w src/index.ts ma byc aliasem KrsErrorCode (jedno zrodlo kodow).");
}
const HTTP_SRC = readFileSync(join(__dirname, "..", "src", "krs-http.ts"), "utf-8");
const kodyTyp = HTTP_SRC.match(/export type KrsErrorCode\s*=\s*([^;]+);/);
const kodyZrodla = new Set(kodyTyp ? [...kodyTyp[1].matchAll(/"(\w+)"/g)].map((m) => m[1]) : []);
const kodyTabeli = new Set(
    [...(HTTP_SRC.match(/export const KODY[^{]*\{([\s\S]*?)\n\};/)?.[1] ?? "").matchAll(/^    (\w+): \{/gm)].map(
        (m) => m[1],
    ),
);
const OBA = SRC + "\n" + HTTP_SRC;
const rzucane = new Set([...OBA.matchAll(/new KrsError\(\s*"(\w+)"/g)].map((m) => m[1]));
const wynikiIndex = new Set([...SRC.matchAll(/errorResult\([\s\S]*?,\s*"(\w+)"\s*,?\s*\)/g)].map((m) => m[1]));
const instructionsText = instructionsMatch ? instructionsMatch[1] : "";
const udokumentowane = new Set(
    [...(instructionsText.split("## Iteracja po bledach")[1] ?? "").matchAll(/^- \\`(\w+)\\` - /gm)].map((m) => m[1]),
);

if (kodyZrodla.size === 0 || kodyTabeli.size === 0 || rzucane.size === 0 || wynikiIndex.size === 0 || udokumentowane.size === 0) {
    failures.push(
        "Pusta lista kodow = BLOKADA (regex nic nie znalazl): " +
            `typ=${kodyZrodla.size} KODY=${kodyTabeli.size} rzucane=${rzucane.size} ` +
            `errorResult=${wynikiIndex.size} INSTRUCTIONS=${udokumentowane.size}`,
    );
}
for (const k of kodyZrodla) {
    if (!kodyTabeli.has(k)) failures.push(`Kod '${k}' nie ma wpisu w tabeli KODY.`);
    if (!udokumentowane.has(k)) failures.push(`Kod '${k}' nie jest udokumentowany w INSTRUCTIONS (sekcja bledow).`);
    if (!rzucane.has(k) && !wynikiIndex.has(k)) {
        failures.push(`Kod '${k}' jest w typie, ale nic go nie zwraca (martwa obietnica w INSTRUCTIONS).`);
    }
}
for (const k of kodyTabeli) {
    if (!kodyZrodla.has(k)) failures.push(`Wpis KODY '${k}' nie jest w typie KrsErrorCode.`);
}
for (const k of udokumentowane) {
    if (!kodyZrodla.has(k)) failures.push(`INSTRUCTIONS dokumentuje kod '${k}', ktorego nie ma w KrsErrorCode.`);
}
for (const k of [...rzucane, ...wynikiIndex]) {
    if (!kodyZrodla.has(k)) failures.push(`Kod '${k}' uzyty w kodzie, a nie ma go w KrsErrorCode.`);
}

if (failures.length === 0) {
    console.log("OK drift - INSTRUCTIONS i ErrorCode spojne z TOOLS i kodem.");
    process.exit(0);
}

console.error("FAIL drift - znaleziono " + failures.length + " problemow:");
for (const f of failures) console.error("  - " + f);
process.exit(1);
