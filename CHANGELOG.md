# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] - 2026-10-13

Aktualizacja zaleznosci (bezpieczenstwo). Bez zmian w kodzie serwera i w kontrakcie narzedzi.

### Security

- `npm audit`: 9 doradztw (1 krytyczne, 4 wysokie, 2 srednie, 2 niskie) -> 0. Zadna paczka nie doszla ani nie zniknela (porownanie zbiorow z lockfile'a); `@modelcontextprotocol/sdk` -> 1.32.1 i jego zaleznosci transportow HTTP (hono, proxy-addr, qs, ip-address, fast-uri i inne).
- Ekspozycja przed poprawka (zderzone z kodem): serwer uzywa wylacznie `StdioServerTransport` - zaleznosci HTTP SDK nie sa ladowane; doradztwo SDK dotyczy KLIENTA OAuth. Realna ekspozycja bliska zera - aktualizacja, bo tania i bez zmiany wersji glownej SDK.
- Weryfikacja: build, wszystkie bramki offline, zywy smoke 5/5 na API KRS.

## [1.2.1] - 2026-10-13

Wydanie 1.2.0 zostalo otagowane, ale NIE trafilo na npm: bramka paczki dostala pusta liste z `npm pack --dry-run --json`, bo npm 12 (runner z `npm install -g npm@latest`) oddaje obiekt kluczowany nazwa paczki zamiast tablicy - i slusznie zablokowala (pusta lista = BLOKADA). 1.2.1 = tresc 1.2.0 + poprawka parsera.

### Fixed

- Bramka paczki: `plikiZPack` rozumie oba formaty `npm pack --json` (npm <= 11: tablica, npm 12: obiekt); nieznany ksztalt nadal = pusta lista = BLOKADA. Testy obu formatow + kontrola na prawdziwym wyjsciu npm 12.

## [1.2.0] - 2026-10-13

Odpornosc na ciche awarie zrodla i provenance (wzorce #1, #4 i #7 z oceny soba-labs/krs-mcp,
2026-10-13). Wersja minor: kody bledow sa rozdzielone, ale zaden znany konsument nie rozgalezia sie na nich - PATRON czyta tylko `isError`, prawo-pl-mcp opakowuje bledy konektora we wlasny `upstream_error` (sprawdzone 2026-10-13).
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

### Fixed

- Naprawa odpisu pelnego (falszywy status `rozwiazana`) wydana wczesniej jako hotfix 1.1.2 - patrz nizej.

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
