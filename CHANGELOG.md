# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-10-13

Hotfix: `get_entity_full` podawal falszywe fakty bez bledu.

### Fixed

- **`get_entity_full` dla aktywnej spolki zwracal status `rozwiazana`**, nazwe `[object Object],[object Object]` i NIP/REGON `?` (zmierzone na zywym API KRS 2026-10-13 na spolce gieldowej; `get_entity` dla tego samego KRS: `aktywny`). Przyczyny: (1) odpis pelny trzyma pola jako tablice historii wpisow, a narzedzie formatowalo go szablonem odpisu aktualnego; (2) `dzial6.rozwiazanieUniewaznienie` wystepuje w odpisie pelnym jako PUSTY kontener `{ okreslenieOkolicznosci: [] }`, a `detectStatus` uznawal samo istnienie obiektu za rozwiazanie.
- Status liczony wylacznie z niepustych i niewykreslonych (bez `nrWpisuWykr`) wpisow dzialu 6 - dotyczy takze `get_entity` i `get_board`.
- `get_entity_full` podaje naglowek (nazwa, forma prawna, NIP, REGON, status) z biezacych wpisow historii; wynik niesie `structuredContent.status: "degraded"` i `partial_result`, a tekst zaczyna sie od "Wynik niepelny" - historii wpisow (~430 KB dla duzej spolki) konektor nie formatuje i odsyla do `get_entity`/`get_board` oraz wyszukiwarki KRS.
- Wersja serwera w `initialize` (`1.1.0`) zrownana z paczka.

### Added

- `KRS_BASE_URL` (env) - test regresji na lokalnej atrapie API KRS przez protokol MCP (`test/odpis-pelny.test.mjs`, 6 przypadkow, w tym kontrole pozytywne: biezacy wpis o rozwiazaniu -> `rozwiazana`, wykreslony -> `aktywny`).
- `npm test` (drift + regresja) i krok "Run gates before publishing" w `release.yml` - do tej pory wydanie szlo bez zadnego testu.

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
