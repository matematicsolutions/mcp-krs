#!/usr/bin/env node
// MCP server - Krajowy Rejestr Sadowy (KRS) przez oficjalne API Ministerstwa
// Sprawiedliwosci. Publiczne, darmowe, brak rejestracji klucza.
//
// Endpoint: https://api-krs.ms.gov.pl/api/krs/OdpisAktualny|OdpisPelny/{KRS}
//
// Tooly:
//   - get_entity      - odpis aktualny (kto, gdzie, NIP/REGON, status)
//   - get_entity_full - odpis pelny (z historia wpisow)
//   - get_board       - skrocona reprezentacja: zarzad + sposob reprezentacji
//
// Pelnotekstowy search po nazwie/NIP - poza zakresem MVP (wymaga GUS REGON API
// z rejestracja klucza, oddzielny serwer MCP w przyszlosci).
//
// structuredContent.citations w kazdej zwrotce - Patron czyta automatycznie.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

const BASE_URL = "https://api-krs.ms.gov.pl/api/krs";
const KRS_UI_BASE = "https://wyszukiwarka-krs.ms.gov.pl/krs/PrzegladKrsRoz";
const HTTP_TIMEOUT_MS = 30000;
const DEFAULT_USER_AGENT =
    "mcp-krs/1.0 (+https://github.com/matematicsolutions/mcp-krs)";

// Throttle 500ms - api-krs.ms.gov.pl wytrzymuje wiecej, ale grzecznie.
const MIN_INTERVAL_MS = 500;
let lastRequestAt = 0;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
}

async function apiGet<T>(path: string): Promise<T | null> {
    const url = `${BASE_URL}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": DEFAULT_USER_AGENT,
                Accept: "application/json",
                "Accept-Language": "pl-PL,pl;q=0.9",
            },
            signal: controller.signal,
        });
        if (res.status === 404) return null;
        if (!res.ok) {
            throw new Error(`MS KRS API HTTP ${res.status} ${res.statusText}`);
        }
        return (await res.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// KRS validation + helpers
// ---------------------------------------------------------------------------

function normalizeKrs(input: string): string {
    // Numer KRS to 10 cyfr, akceptujemy z mysłnikami lub bez.
    const digits = String(input).replace(/\D/g, "");
    if (digits.length === 0 || digits.length > 10) {
        throw new Error(
            `Nieprawidlowy numer KRS: "${input}". Wymagane 1-10 cyfr (zera wiodace dopelniane).`,
        );
    }
    return digits.padStart(10, "0");
}

function krsUiUrl(krs: string): string {
    return `${KRS_UI_BASE}?krs=${encodeURIComponent(krs)}`;
}

// ---------------------------------------------------------------------------
// Domain types - czastkowe modelowanie odpowiedzi MS API
// (pelna struktura ma > 100 pol, my pickujemy te najwazniejsze dla kancelarii)
// ---------------------------------------------------------------------------

interface NaglowekA {
    rejestr?: string;
    numerKRS?: string;
    dataCzasOdpisu?: string;
    stanZDnia?: string;
    dataRejestracjiWKRS?: string;
    numerOstatniegoWpisu?: number;
    dataOstatniegoWpisu?: string;
    oznaczenieSaduDokonujacegoOstatniegoWpisu?: string;
}

interface DanePodmiotu {
    formaPrawna?: string;
    identyfikatory?: { regon?: string; nip?: string };
    nazwa?: string;
    czyPosiadaStatusOPP?: boolean;
}

interface Adres {
    ulica?: string;
    nrDomu?: string;
    nrLokalu?: string;
    miejscowosc?: string;
    kodPocztowy?: string;
    poczta?: string;
    kraj?: string;
}

interface SiedzibaIAdres {
    siedziba?: {
        kraj?: string;
        wojewodztwo?: string;
        powiat?: string;
        gmina?: string;
        miejscowosc?: string;
    };
    adres?: Adres;
    adresPocztyElektronicznej?: string;
    adresStronyInternetowej?: string;
}

interface OsobaSkladuOrganu {
    nazwisko?: { nazwiskoICzlon?: string; pierwszeImie?: string; drugieImie?: string };
    funkcja?: string;
}

interface Organ {
    nazwa?: string;
    sklad?: OsobaSkladuOrganu[];
    sposobReprezentacji?: string;
}

interface OdpisData {
    dzial1?: {
        danePodmiotu?: DanePodmiotu;
        siedzibaIAdres?: SiedzibaIAdres;
        kapital?: {
            wysokoscKapitaluZakladowego?: { wartosc?: string; waluta?: string };
            wysokoscKapitaluWplaconego?: { wartosc?: string; waluta?: string };
            iloscAkcji?: string;
            wartoscNominalnaAkcji?: { wartosc?: string; waluta?: string };
        };
    };
    dzial2?: {
        reprezentacja?: Organ;
        organNadzoru?: Organ[];
        prokurenci?: OsobaSkladuOrganu[];
    };
    dzial3?: {
        przedmiotDzialalnosci?: {
            przedmiotPrzewazajacejDzialalnosci?: { kodPKD?: string; opis?: string }[];
            przedmiotPozostalejDzialalnosci?: { kodPKD?: string; opis?: string }[];
        };
    };
    dzial6?: {
        likwidacja?: unknown;
        rozwiazanieUniewaznienie?: unknown;
        zawieszenieDzialalnosci?: unknown;
        postepowanieUpadlosciowe?: unknown;
    };
}

interface Odpis {
    rodzaj?: string;
    naglowekA?: NaglowekA;
    dane?: OdpisData;
}

interface OdpisResponse {
    odpis?: Odpis;
}

// ---------------------------------------------------------------------------
// Citation builder
// ---------------------------------------------------------------------------

interface KrsCitation {
    title: string;
    url: string;
    snippet?: string;
    krs: string;
    nazwa?: string;
    nip?: string;
    regon?: string;
    forma_prawna?: string;
    status?: string;
    miejscowosc?: string;
    sad_rejestrowy?: string;
    rejestr?: string;
}

function detectStatus(d?: OdpisData): string {
    if (!d?.dzial6) return "aktywny";
    const d6 = d.dzial6;
    if (d6.postepowanieUpadlosciowe) return "upadlosc";
    if (d6.likwidacja) return "likwidacja";
    if (d6.rozwiazanieUniewaznienie) return "rozwiazana";
    if (d6.zawieszenieDzialalnosci) return "zawieszona";
    return "aktywny";
}

function buildCitation(krs: string, odpis: Odpis): KrsCitation {
    const dp = odpis.dane?.dzial1?.danePodmiotu;
    const adr = odpis.dane?.dzial1?.siedzibaIAdres?.adres;
    const nazwa = dp?.nazwa ?? `KRS ${krs}`;
    const forma = dp?.formaPrawna;
    const title = forma ? `${nazwa} (${forma})` : nazwa;
    const snippetParts: string[] = [];
    if (adr?.miejscowosc) snippetParts.push(adr.miejscowosc);
    if (dp?.identyfikatory?.nip)
        snippetParts.push(`NIP ${dp.identyfikatory.nip}`);
    if (dp?.identyfikatory?.regon)
        snippetParts.push(`REGON ${dp.identyfikatory.regon}`);

    return {
        title,
        url: krsUiUrl(krs),
        ...(snippetParts.length && { snippet: snippetParts.join(" · ") }),
        krs,
        ...(dp?.nazwa && { nazwa: dp.nazwa }),
        ...(dp?.identyfikatory?.nip && { nip: dp.identyfikatory.nip }),
        ...(dp?.identyfikatory?.regon && { regon: dp.identyfikatory.regon }),
        ...(forma && { forma_prawna: forma }),
        status: detectStatus(odpis.dane),
        ...(adr?.miejscowosc && { miejscowosc: adr.miejscowosc }),
        ...(odpis.naglowekA?.oznaczenieSaduDokonujacegoOstatniegoWpisu && {
            sad_rejestrowy:
                odpis.naglowekA.oznaczenieSaduDokonujacegoOstatniegoWpisu,
        }),
        ...(odpis.naglowekA?.rejestr && { rejestr: odpis.naglowekA.rejestr }),
    };
}

// ---------------------------------------------------------------------------
// Text formatters
// ---------------------------------------------------------------------------

function osobaAsText(o: OsobaSkladuOrganu): string {
    const n = o.nazwisko;
    const name = [n?.pierwszeImie, n?.drugieImie, n?.nazwiskoICzlon]
        .filter(Boolean)
        .join(" ");
    return o.funkcja ? `${name} (${o.funkcja})` : name || "(brak nazwiska)";
}

function formatAdres(a?: Adres): string {
    if (!a) return "?";
    const street = [a.ulica, a.nrDomu].filter(Boolean).join(" ");
    const lokal = a.nrLokalu ? ` lok. ${a.nrLokalu}` : "";
    const city = [a.kodPocztowy, a.miejscowosc].filter(Boolean).join(" ");
    return `${street}${lokal}, ${city}`;
}

function formatEntity(krs: string, odpis: Odpis): string {
    const dp = odpis.dane?.dzial1?.danePodmiotu;
    const adres = odpis.dane?.dzial1?.siedzibaIAdres?.adres;
    const kapital = odpis.dane?.dzial1?.kapital;
    const reprezentacja = odpis.dane?.dzial2?.reprezentacja;
    const prokurenci = odpis.dane?.dzial2?.prokurenci ?? [];
    const status = detectStatus(odpis.dane);

    const lines: string[] = [
        `=== ${odpis.rodzaj ?? "Odpis"} KRS ${krs} ===`,
        "",
        `Nazwa        : ${dp?.nazwa ?? "?"}`,
        `Forma prawna : ${dp?.formaPrawna ?? "?"}`,
        `NIP          : ${dp?.identyfikatory?.nip ?? "?"}`,
        `REGON        : ${dp?.identyfikatory?.regon ?? "?"}`,
        `Status       : ${status}`,
        `Adres        : ${formatAdres(adres)}`,
    ];
    if (dp?.czyPosiadaStatusOPP) {
        lines.push("Status OPP   : TAK (organizacja pozytku publicznego)");
    }
    if (kapital?.wysokoscKapitaluZakladowego?.wartosc) {
        const k = kapital.wysokoscKapitaluZakladowego;
        lines.push(`Kapital zakl.: ${k.wartosc} ${k.waluta ?? ""}`.trim());
    }

    lines.push("", "--- Reprezentacja (dzial 2) ---");
    if (reprezentacja?.sposobReprezentacji) {
        lines.push(`Sposob : ${reprezentacja.sposobReprezentacji}`);
    }
    if (reprezentacja?.nazwa) {
        lines.push(`Organ  : ${reprezentacja.nazwa}`);
    }
    if (reprezentacja?.sklad?.length) {
        lines.push("Sklad  :");
        for (const o of reprezentacja.sklad) {
            lines.push(`  - ${osobaAsText(o)}`);
        }
    } else {
        lines.push("(Brak danych o skladzie organu w odpisie)");
    }
    if (prokurenci.length > 0) {
        lines.push("", "Prokurenci:");
        for (const p of prokurenci) lines.push(`  - ${osobaAsText(p)}`);
    }

    const dzial3 = odpis.dane?.dzial3?.przedmiotDzialalnosci;
    if (dzial3?.przedmiotPrzewazajacejDzialalnosci?.length) {
        lines.push("", "--- Przedmiot dzialalnosci (PKD) ---");
        const main = dzial3.przedmiotPrzewazajacejDzialalnosci[0];
        if (main) lines.push(`Przewazajacy: ${main.kodPKD ?? ""} - ${main.opis ?? ""}`);
        const pozostale = dzial3.przedmiotPozostalejDzialalnosci ?? [];
        if (pozostale.length > 0) {
            lines.push(`Pozostalych pozycji PKD: ${pozostale.length}`);
        }
    }

    lines.push("", `URL rejestru: ${krsUiUrl(krs)}`);
    if (odpis.naglowekA?.dataRejestracjiWKRS) {
        lines.push(`Data wpisu  : ${odpis.naglowekA.dataRejestracjiWKRS}`);
    }
    if (odpis.naglowekA?.dataOstatniegoWpisu) {
        lines.push(
            `Ostatni wpis: ${odpis.naglowekA.dataOstatniegoWpisu} (Nr ${odpis.naglowekA.numerOstatniegoWpisu ?? "?"})`,
        );
    }
    if (odpis.naglowekA?.oznaczenieSaduDokonujacegoOstatniegoWpisu) {
        lines.push(
            `Sad rej.    : ${odpis.naglowekA.oznaczenieSaduDokonujacegoOstatniegoWpisu}`,
        );
    }
    return lines.join("\n");
}

function formatBoardOnly(krs: string, odpis: Odpis): string {
    const dp = odpis.dane?.dzial1?.danePodmiotu;
    const reprezentacja = odpis.dane?.dzial2?.reprezentacja;
    const prokurenci = odpis.dane?.dzial2?.prokurenci ?? [];
    const lines: string[] = [
        `=== Reprezentacja KRS ${krs} - ${dp?.nazwa ?? "?"} ===`,
        "",
    ];
    if (reprezentacja?.sposobReprezentacji) {
        lines.push(`Sposob reprezentacji:`);
        lines.push(reprezentacja.sposobReprezentacji);
        lines.push("");
    }
    if (reprezentacja?.nazwa) lines.push(`Organ: ${reprezentacja.nazwa}`);
    if (reprezentacja?.sklad?.length) {
        lines.push("Sklad zarzadu/wladz:");
        for (const o of reprezentacja.sklad) {
            lines.push(`  - ${osobaAsText(o)}`);
        }
    }
    if (prokurenci.length > 0) {
        lines.push("", "Prokurenci:");
        for (const p of prokurenci) lines.push(`  - ${osobaAsText(p)}`);
    }
    lines.push("", `URL rejestru: ${krsUiUrl(krs)}`);
    return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const REJESTR_OPTIONS = ["P", "S"] as const;

// ---------------------------------------------------------------------------
// Instructions (procedural orchestration)
// Pattern z dograh-hq/dograh v1.31.0 (BSD-2) via mcp-eu-compliance v0.2.0.
// ---------------------------------------------------------------------------

const INSTRUCTIONS = `Ten serwer MCP udostepnia Krajowy Rejestr Sadowy (KRS) przez oficjalne darmowe API Ministerstwa Sprawiedliwosci (api.krs.ms.gov.pl). Dane KRS publiczne ale RODO dotyczy przy laczeniu (zarzad = osoby fizyczne).

## Kolejnosc wywolan

### Stan aktualny podmiotu
1. \`get_entity\` - odpis aktualny po KRS (np. '0000028860' lub krocej '28860' - auto-padding). Zwraca nazwe, NIP, REGON, adres, kapital, zarzad, prokurentow, status.

### Tylko reprezentacja
2. \`get_board\` - skrocony: tylko zarzad + sposob reprezentacji + prokurenci. Szybciej niz get_entity gdy potrzebujesz tylko "kto reprezentuje X".

### Historia zmian
3. \`get_entity_full\` - odpis pelny ze wszystkimi historycznymi wpisami. Duza odpowiedz, uzywaj kiedy potrzebujesz historii zarzadu / sukcesji.

## Twarde ograniczenia

- **Snapshot in time** - odpis ma date wystawienia. Cytowanie "KRS na dzien YYYY-MM-DD" jest KLUCZOWE. Outdated = blad merytoryczny.
- **Rejestr P (przedsiebiorcy) vs S (stowarzyszenia)** - default P. Dla fundacji/stowarzyszen uzyj S.
- **NIE buduj profili osob fizycznych** - get_board zwraca jak sa, ale agregacja "ktora osoba w ilu zarzadach" to ryzyko RODO (cel przetwarzania). To powinno byc w produkcie z podstawa, NIE w konektorze.
- **Stateless, bez cache** - kazde wywolanie fresh do MS API.
- **\`structuredContent.citations\`**: title (nazwa podmiotu), url (krs.ms.gov.pl), krs_number, odpis_date, rejestr. Cytuj w odpowiedzi.

## Iteracja po bledach

Tool zwraca \`isError: true\` + tekst z prefixem \`[code]\`. Kody:
- \`missing_arg\` - brak \`krs\` (numer 1-10 cyfr wymagany).
- \`invalid_krs\` - format nieprawidlowy (np. niecyfry, ponad 10 cyfr).
- \`not_found\` - KRS nie istnieje w danym rejestrze. Sprobuj drugi rejestr (P↔S) lub sprawdz cyfry.
- \`upstream_error\` - blad MS API. Retry raz przed surface do uzytkownika.

## Styl odpowiedzi

- Cytuj z data odpisu: "KRS 0000028860 (PKO BP S.A., odpis na 2026-05-25)".
- Dla zarzadu wymien funkcje + nazwiska + role (Prezes/Czlonek), z disclaimerem o RODO przy publikacji.
- NIE wymyslaj nazw firm ani sklad zarzadu - wszystko z \`structuredContent.citations\`.`;

const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: true, // upstream MS API live
} as const;

const TOOLS = [
    {
        name: "get_entity",
        annotations: READ_ONLY_ANNOTATIONS,
        description:
            "Pobiera ODPIS AKTUALNY z Krajowego Rejestru Sadowego po numerze KRS. " +
            "Zwraca pelne dane podmiotu: nazwa, forma prawna, NIP, REGON, adres, " +
            "kapital zakladowy, reprezentacja (zarzad + sposob reprezentacji), " +
            "prokurenci, glowny PKD, status (aktywny/likwidacja/upadlosc) + URL " +
            "do wyszukiwarki KRS. Numer KRS uzupelnij zerami wiodacymi (lub podaj " +
            "krotszy - zostanie wyrównany do 10 cyfr).",
        inputSchema: {
            type: "object",
            properties: {
                krs: {
                    type: "string",
                    description:
                        "Numer KRS (1-10 cyfr, np. '28860' -> automatyczne '0000028860').",
                },
                rejestr: {
                    type: "string",
                    description:
                        "Rejestr: 'P' = przedsiebiorcow (domyslnie), 'S' = stowarzyszen.",
                    enum: ["P", "S"],
                },
            },
            required: ["krs"],
        },
    },
    {
        name: "get_entity_full",
        annotations: READ_ONLY_ANNOTATIONS,
        description:
            "Pobiera ODPIS PELNY z KRS (z historia wpisow - kazda zmiana, kazde " +
            "wykreslenie, wszystkie poprzednie sklady zarzadu). Wieksza odpowiedz, " +
            "uzywaj kiedy potrzebujesz historii zmian, nie tylko stanu aktualnego.",
        inputSchema: {
            type: "object",
            properties: {
                krs: {
                    type: "string",
                    description: "Numer KRS (1-10 cyfr).",
                },
                rejestr: {
                    type: "string",
                    description: "Rejestr: 'P' (default) lub 'S'.",
                    enum: ["P", "S"],
                },
            },
            required: ["krs"],
        },
    },
    {
        name: "get_board",
        annotations: READ_ONLY_ANNOTATIONS,
        description:
            "SKROCONA wersja: tylko sklad zarzadu + sposob reprezentacji + prokurenci. " +
            "Szybciej niz get_entity gdy potrzebujesz tylko 'kto reprezentuje X'. " +
            "Bazuje na odpisie aktualnym.",
        inputSchema: {
            type: "object",
            properties: {
                krs: {
                    type: "string",
                    description: "Numer KRS (1-10 cyfr).",
                },
                rejestr: {
                    type: "string",
                    description: "Rejestr: 'P' (default) lub 'S'.",
                    enum: ["P", "S"],
                },
            },
            required: ["krs"],
        },
    },
] as const;

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

// Strukturalne kody bledow.
type ErrorCode = "missing_arg" | "invalid_krs" | "not_found" | "upstream_error";

function errorResult(text: string, code: ErrorCode) {
    return {
        content: [{ type: "text" as const, text: `[${code}] ${text}` }],
        structuredContent: { error_code: code },
        isError: true,
    };
}

const server = new Server(
    { name: "mcp-krs", version: "1.1.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
    })),
}));

async function fetchOdpis(
    krs: string,
    rejestr: string,
    typ: "OdpisAktualny" | "OdpisPelny",
): Promise<{ krs: string; odpis: Odpis | null }> {
    const normalized = normalizeKrs(krs);
    const path = `/${typ}/${normalized}?rejestr=${encodeURIComponent(rejestr)}&format=json`;
    const data = await throttled(() => apiGet<OdpisResponse>(path));
    return { krs: normalized, odpis: data?.odpis ?? null };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;
    const krsRaw = a.krs;
    const rejestr =
        typeof a.rejestr === "string" && (a.rejestr === "P" || a.rejestr === "S")
            ? a.rejestr
            : "P";

    if (typeof krsRaw !== "string" || krsRaw.length === 0) {
        return errorResult(
            "parametr 'krs' (numer rejestrowy 1-10 cyfr) jest wymagany.",
            "missing_arg",
        );
    }
    if (!/^\d{1,10}$/.test(krsRaw)) {
        return errorResult(
            `numer KRS '${krsRaw}' nieprawidlowy. Wymagane 1-10 cyfr (np. '28860' lub '0000028860').`,
            "invalid_krs",
        );
    }

    try {
        switch (name) {
            case "get_entity": {
                const { krs, odpis } = await fetchOdpis(
                    krsRaw,
                    rejestr,
                    "OdpisAktualny",
                );
                if (!odpis) {
                    return errorResult(
                        `Brak wpisu o numerze KRS ${krs} w rejestrze "${rejestr}". Sprawdz w wyszukiwarce: ${krsUiUrl(krs)}. Sprobuj tez drugi rejestr (${rejestr === "P" ? "S" : "P"}).`,
                        "not_found",
                    );
                }
                return {
                    content: [{ type: "text", text: formatEntity(krs, odpis) }],
                    structuredContent: {
                        citations: [buildCitation(krs, odpis)],
                    },
                };
            }

            case "get_entity_full": {
                const { krs, odpis } = await fetchOdpis(
                    krsRaw,
                    rejestr,
                    "OdpisPelny",
                );
                if (!odpis) {
                    return errorResult(
                        `Brak odpisu pelnego dla KRS ${krs} (rejestr "${rejestr}").`,
                        "not_found",
                    );
                }
                // Format identyczny - dane sa wieksze (historia w wartosciach),
                // LLM dostaje pelen plik tekstowy.
                return {
                    content: [{ type: "text", text: formatEntity(krs, odpis) }],
                    structuredContent: {
                        citations: [buildCitation(krs, odpis)],
                    },
                };
            }

            case "get_board": {
                const { krs, odpis } = await fetchOdpis(
                    krsRaw,
                    rejestr,
                    "OdpisAktualny",
                );
                if (!odpis) {
                    return errorResult(`Brak wpisu o numerze KRS ${krs}.`, "not_found");
                }
                return {
                    content: [
                        { type: "text", text: formatBoardOnly(krs, odpis) },
                    ],
                    structuredContent: {
                        citations: [buildCitation(krs, odpis)],
                    },
                };
            }

            default:
                return errorResult(`Nieznane narzedzie: ${name}`, "missing_arg");
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/404|not found/i.test(msg)) {
            return errorResult(`KRS nie znaleziony w MS API: ${msg}.`, "not_found");
        }
        return errorResult(
            `Blad komunikacji z API MS KRS: ${msg}. Sprobuj ponownie za chwile.`,
            "upstream_error",
        );
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("mcp-krs server started (stdio transport)\n");
}

void REJESTR_OPTIONS;

main().catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
});
