/**
 * HTTP do API KRS (Ministerstwo Sprawiedliwosci) + jeden katalog bledow (kanon MCP 6b/6c).
 *
 * Osobny modul, zeby testy (test/krs-http.test.mjs) mogly go importowac bez startu
 * serwera MCP na stdio. Wzorzec: mcp-saos `src/saos-http.ts`.
 */

/** Czyja wina: caller (pytanie), upstream (API KRS), network (siec), server (ten serwer). */
export type Fault = "caller" | "upstream" | "network" | "server";

export type KrsErrorCode =
    | "missing_arg"
    | "invalid_krs"
    | "not_found"
    | "rate_limited"
    | "forbidden"
    | "upstream_unavailable"
    | "upstream_shape"
    | "upstream_error"
    | "internal_error";

/** Jedna tabela: kod -> wina, czy ponawiac, co zrobic. Drift test pilnuje jej w obie strony. */
export const KODY: Record<KrsErrorCode, { fault: Fault; retryable: boolean; coZrobic: string }> = {
    missing_arg: {
        fault: "caller",
        retryable: false,
        coZrobic: "Podaj parametr `krs` (numer 1-10 cyfr) albo uzyj nazwy narzedzia z tools/list.",
    },
    invalid_krs: {
        fault: "caller",
        retryable: false,
        coZrobic: "Numer KRS to 1-10 cyfr, bez liter; zera wiodace sa dopelniane.",
    },
    not_found: {
        fault: "caller",
        retryable: false,
        coZrobic: "Sprawdz cyfry albo drugi rejestr (P <-> S).",
    },
    rate_limited: {
        fault: "upstream",
        retryable: true,
        coZrobic: "Odczekaj retry_after_s i ponow raz; nie ponawiaj w petli.",
    },
    forbidden: {
        fault: "upstream",
        retryable: false,
        coZrobic:
            "API KRS odmowilo dostepu - zmiana zabezpieczen zrodla. Nie ponawiaj i nie obchodz " +
            "zabezpieczen; zglos czlowiekowi.",
    },
    upstream_unavailable: {
        fault: "upstream",
        retryable: true,
        coZrobic: "API KRS chwilowo nie odpowiada; ponow raz pozniej, potem powiedz uzytkownikowi o awarii.",
    },
    upstream_shape: {
        fault: "upstream",
        retryable: false,
        coZrobic:
            "API KRS oddalo cos innego niz odpis JSON (strona bledu, zmiana kontraktu). To NIE jest " +
            "brak podmiotu; powiedz uzytkownikowi o awarii zrodla.",
    },
    upstream_error: {
        fault: "upstream",
        retryable: false,
        coZrobic: "Nieoczekiwana odpowiedz API KRS; powiedz uzytkownikowi o awarii zamiast zgadywac wynik.",
    },
    internal_error: {
        fault: "server",
        retryable: false,
        coZrobic: "Blad tego serwera MCP, nie API KRS. Nie ponawiaj; zglos blad konektora.",
    },
};

export class KrsError extends Error {
    readonly code: KrsErrorCode;
    readonly fault: Fault;
    readonly retryable: boolean;
    readonly status?: number;
    readonly retryAfterS?: number;

    constructor(
        code: KrsErrorCode,
        message: string,
        opts: { status?: number; retryAfterS?: number; fault?: Fault } = {},
    ) {
        super(message);
        this.name = "KrsError";
        this.code = code;
        this.fault = opts.fault ?? KODY[code].fault;
        this.retryable = KODY[code].retryable;
        this.status = opts.status;
        this.retryAfterS = opts.retryAfterS;
    }
}

/**
 * Wyjatek albo KrsError -> wynik MCP z kodem, wina i ponawialnoscia.
 * Wyjatek spoza KrsError (TypeError w formatterze itp.) to `internal_error` z wina `server` -
 * do 2026-10-13 kazdy taki blad szedl jako "Blad komunikacji z API MS KRS, sprobuj ponownie".
 */
export function bladJakoWynik(err: unknown) {
    const e =
        err instanceof KrsError
            ? err
            : new KrsError(
                  "internal_error",
                  `Blad wewnetrzny konektora: ${err instanceof Error ? err.message : String(err)}`,
              );
    const szczegoly = [`fault=${e.fault}`, `retryable=${e.retryable}`];
    if (e.retryAfterS !== undefined) szczegoly.push(`retry_after_s=${e.retryAfterS}`);
    if (e.status !== undefined) szczegoly.push(`status=${e.status}`);
    const structured: Record<string, unknown> = {
        error_code: e.code,
        fault: e.fault,
        retryable: e.retryable,
    };
    if (e.retryAfterS !== undefined) structured.retry_after_s = e.retryAfterS;
    if (e.status !== undefined) structured.status = e.status;
    return {
        content: [
            {
                type: "text" as const,
                text: `[${e.code}] ${e.message} (${szczegoly.join(", ")}). Co zrobic: ${KODY[e.code].coZrobic}`,
            },
        ],
        structuredContent: structured,
        isError: true,
    };
}

const SUFIT_RETRY_AFTER_S = 30;

/**
 * Klasyfikacja odpowiedzi API KRS. Czysta funkcja: status + typ + cialo -> JSON | null | KrsError.
 * 404 -> null (brak podmiotu; komunikat z podpowiedzia rejestru buduje narzedzie).
 * Typ zawartosci sprawdzamy ZANIM sparsujemy - inaczej strona HTML/200 konczy jako blad parsera.
 */
export function klasyfikuj(
    url: string,
    status: number,
    contentType: string,
    body: string,
    retryAfter?: string | null,
): unknown {
    if (status === 404) return null;
    if (status === 401 || status === 403) {
        throw new KrsError("forbidden", `API KRS odmowilo dostepu (${status}): ${url}`, { status });
    }
    if (status === 429) {
        const ra = /^\d+$/.test((retryAfter ?? "").trim())
            ? Math.min(Number(retryAfter), SUFIT_RETRY_AFTER_S)
            : undefined;
        throw new KrsError("rate_limited", `API KRS ogranicza liczbe zapytan (429): ${url}`, {
            status,
            retryAfterS: ra,
        });
    }
    if (status >= 500) {
        throw new KrsError("upstream_unavailable", `API KRS odpowiedzialo ${status}: ${url}`, { status });
    }
    if (status < 200 || status >= 300) {
        throw new KrsError("upstream_error", `API KRS odpowiedzialo ${status}: ${url}`, { status });
    }
    if (!contentType.toLowerCase().includes("json")) {
        throw new KrsError(
            "upstream_shape",
            `API KRS oddalo ${contentType || "nieznany typ"} zamiast JSON (${status}): ${url}`,
            { status },
        );
    }
    try {
        return JSON.parse(body);
    } catch {
        // Poprawny naglowek, zepsute cialo - awaria zrodla, nie naszego kodu.
        throw new KrsError("upstream_shape", `API KRS oddalo uszkodzony JSON: ${url}`, { status });
    }
}

/**
 * GET JSON z API KRS; 404 -> null, kazda inna awaria -> KrsError z kodem z KODY.
 * Timeout obejmuje takze czytanie ciala (odpis pelny potrafi miec setki kB).
 */
export async function fetchJson(
    url: string,
    headers: Record<string, string>,
    timeoutMs = 30000,
): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let res: Response;
        let body: string;
        try {
            res = await fetch(url, { method: "GET", headers, signal: controller.signal });
            body = await res.text();
        } catch (err) {
            if (controller.signal.aborted) {
                throw new KrsError("upstream_unavailable", `API KRS nie odpowiedzialo w ${timeoutMs / 1000} s: ${url}`, {
                    fault: "network",
                });
            }
            const przyczyna = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
            throw new KrsError("upstream_unavailable", `Blad sieci (${przyczyna}): ${url}`, { fault: "network" });
        }
        return klasyfikuj(url, res.status, res.headers.get("content-type") ?? "", body, res.headers.get("retry-after"));
    } finally {
        clearTimeout(timer);
    }
}
