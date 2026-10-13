# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Odpornosc na ciche awarie zrodla i provenance (wzorce #1, #4 i #7 z oceny soba-labs/krs-mcp,
2026-10-13). **Do decyzji przy wydaniu: wersja.** Kody bledow sa rozdzielone - klient branchujacy
na `upstream_error` przy awarii zrodla dostanie teraz `forbidden`, `rate_limited`,
`upstream_unavailable`, `upstream_shape` albo `internal_error`; `structuredContent` bledu niesie
tez `fault` i `retryable`. Opisy narzedzi (tools/list) bez zmian. Wyszukiwarki po nazwie przez
nieudokumentowany endpoint frontendu (wzorzec #9) NIE bierzemy - konektor uzywa wylacznie
oficjalnego API odpisow.

### Fixed

- **401/403 od API KRS** wychodzilo jako `upstream_error` "Sprobuj ponownie za chwile". Teraz `forbidden` (`retryable: false`, jedno zapytanie, bez ponawiania i bez obchodzenia zabezpieczen).
- **200 + JSON bez obiektu `odpis`** (zmiana kontraktu zrodla) wychodzilo jako `not_found` "sprawdz cyfry". Teraz `upstream_shape`.
- **HTML/200 i uszkodzony JSON** konczyly sie bledem parsera ("Unexpected token <") jako `upstream_error` "sprobuj ponownie". Typ zawartosci jest sprawdzany przed parsowaniem; teraz `upstream_shape`.
- **Klasyfikacja bledu regexem `/404|not found/` na tresci komunikatu** - usunieta; kod wynika ze statusu HTTP.
- **Blad wewnatrz konektora** (np. w formatterze) udawal "Blad komunikacji z API MS KRS". Teraz `internal_error` z wina `server`.
- **Drift test** konczyl tekst INSTRUCTIONS na pierwszym "\`;" i po cichu ucinal reszte instrukcji; teraz konczy na nieescapowanym backticku. Test nie byl tez uruchamiany w CI.

### Added

- Sonda zgodnosci `node test/sonda.mjs` (wzorzec soba-labs/krs-mcp #2): znany rekord KRS 0000028860 (spolka gieldowa): `get_entity` + `get_entity_full` - NIP i status `aktywny`, przez protokol MCP do zbudowanego serwera; trojstan 0 OK / 10 UWAGI / 20 BLOKADA (`retryable: true` = UWAGI; strazni regresji falszywego `rozwiazana`); pusta lista kontroli = BLOKADA. Workflow `sonda-zgodnosci.yml` codziennie (bez automatycznych issue). Testy na atrapie `test/sonda.test.mjs`; na zywo 13.10: OK 2/2.
- `src/krs-http.ts`: jeden katalog kodow (`KODY`: kod -> `fault` caller/upstream/network/server, `retryable`, "co zrobic"). `Retry-After` z sufitem 30 s. Timeout obejmuje tez czytanie ciala odpowiedzi.
- `structuredContent.provenance` w kazdym udanym wyniku: `source` (URL odpisu), `retrieved_at`, `source_produced_at` (czas wytworzenia odpisu `dataCzasOdpisu` z naglowka MS, doslownie w formacie MS; `null`, gdy zrodlo go nie poda), `processing` (warunki ponownego wykorzystania ISP).
- `KRS_BASE_URL` (env) - testy E2E na lokalnej atrapie API KRS przez protokol MCP (`test/e2e-atrapa.test.mjs`, pelny mianownik narzedzi z `tools/list`).
- Zywy smoke `npm run smoke` (`test/smoke.mjs`): kazde narzedzie z przypadkiem zywym, mianownik z `tools/list`; nie wypisuje tresci odpisow.
- Bramka paczki `npm run test:package` (`npm pack --dry-run --json`; wymagane pliki wyprowadzone z `bin` + importow w `dist/`, pusta lista = BLOKADA).
- `release.yml`: krok "Run gates before publishing" (`npm test`, bramka paczki) - do tej pory wydanie szlo bez zadnego testu. `ci.yml`: `npm test` i bramka paczki (wczesniej tylko build).
- Drift test w obie strony dla kodow z `src/krs-http.ts` (typ <-> `KODY` <-> INSTRUCTIONS <-> uzycia; pusta lista = BLOKADA).

### Fixed (odpis pelny - falszywe fakty bez bledu)

- **`get_entity_full` na zywym zrodle** podawal dla aktywnej spolki gieldowej status `rozwiazana`, nazwe `[object Object],[object Object]` i NIP/REGON `?` (zmierzone 2026-10-13; `get_entity` ten sam KRS: `aktywny`). Dwie przyczyny: (1) odpis pelny trzyma pola jako tablice historii wpisow, a narzedzie formatowalo go szablonem odpisu aktualnego; (2) `dzial6.rozwiazanieUniewaznienie` istnieje w odpisie pelnym jako PUSTY kontener `{ okreslenieOkolicznosci: [] }`, a `detectStatus` sprawdzal samo istnienie obiektu.
- Teraz: status liczony wylacznie z niepustych i niewykreslonych wpisow (dotyczy tez odpisu aktualnego); naglowek odpisu pelnego (nazwa, forma, NIP, REGON) z biezacych wpisow historii (bez `nrWpisuWykr`); wynik `status: degraded` + `partial_result` i odpowiedz zaczynajaca sie od "Wynik niepelny" - historii wpisow (~430 KB) konektor nie formatuje, odsyla do `get_entity`/`get_board` i wyszukiwarki KRS. Zywy smoke 5/5. **Zmiana kontraktu `get_entity_full` (krotszy wynik) - do decyzji przy wydaniu: wersja.** Pelny formatter historii = osobna decyzja produktowa.

## [1.1.0] — 2026-05-25

Retrofit do kanonu MCP MateMatic (pattern z dograh v1.31.0 BSD-2). Backward-compatible.

### Added

- `instructions` w Server (snapshot in time / data odpisu kluczowa, rejestr P vs S, RODO ostrzezenie przy budowie profili osob).
- `ToolAnnotations` per tool (`readOnlyHint`, `openWorldHint=true` bo MS API live).
- Strukturalne `ErrorCode`: `missing_arg`, `invalid_krs`, `not_found`, `upstream_error`. Format `[code] tekst` + `structuredContent.error_code`.
- Walidacja formatu KRS (1-10 cyfr) przed wyslaniem do upstream.
- Routing HTTP 404 -> `not_found` z sugestia spr drugiego rejestru.
- Drift test (`npm run drift`).

## [1.0.0] — 2026-05-20

Initial public release.

Polish company registry (KRS) via official, free Ministry of Justice JSON API. No key required. 3 tools: get_entity / get_entity_full / get_board.

### Highlights

- Node 18+ stdio MCP server, single `dist/index.js` entry.
- LIVE smoke-tested on real data.
- `structuredContent.citations` consumed by [Patron](https://github.com/matematicsolutions/patron)
  and any other MCP-aware legal agent.
- MIT license, 500 ms request throttle, zero secrets required.

[1.0.0]: https://github.com/matematicsolutions/mcp-krs/releases/tag/v1.0.0
