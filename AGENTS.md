# AGENTS.md - mcp-krs

Plik standardu [agents.md](https://agents.md) (Linux Foundation / Agentic AI Foundation) - kanoniczne instrukcje dla agentow AI pracujacych z tym repozytorium. Czytany natywnie przez Cursor, Codex (OpenAI), Jules (Google), Devin / Windsurf, Aider, Amp, Factory, GitHub Copilot.

## Cel projektu

Serwer **MCP (Model Context Protocol)** dla **Krajowego Rejestru Sadowego (KRS)** - przez oficjalne, darmowe API **Ministerstwa Sprawiedliwosci** (`api.krs.ms.gov.pl`).

Jeden z 5 konektorow polskiego prawa MateMatic ([`mcp-saos`](https://github.com/matematicsolutions/mcp-saos), [`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa), [`mcp-isap`](https://github.com/matematicsolutions/mcp-isap), [`mcp-krs`](https://github.com/matematicsolutions/mcp-krs) (ten), [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql)).

## Kontekst MateMatic (TWARDE OGRANICZENIA)

Repo prowadzi [MateMatic Solutions](https://matematicsolutions.com).

- **Dane KRS sa publiczne** ale dotyczy je RODO przy laczeniu z innymi danymi (zarzad = osoby fizyczne).
- **Kazde wywolanie narzedzia MUSI zwracac `structuredContent.citations`** z: numerem KRS, data odpisu, URL kanonicznym (krs.ms.gov.pl).
- **Stateless** - bez cache.
- **Tylko aktualny rejestr lub pelny historyczny** - kazdy odpis ma date snapshot, ktora musi byc w citation. Outdated KRS = ryzyko blad merytoryczny.

## Narzedzia MCP (tools contract)

| Tool | Parametry kluczowe | Zwraca |
|---|---|---|
| `get_entity` | `krs_number` | aktualny odpis: nazwa, NIP, REGON, status, kapital + citations |
| `get_entity_full` | `krs_number` | pelny odpis historyczny (wszystkie zmiany od rejestracji) |
| `get_board` | `krs_number` | aktualny zarzad + organy nadzorcze (uwaga: PII osob fizycznych) |

Pelny opis: `src/index.ts` + `README.md`.

## Build i test

```bash
npm install        # Node 20+
npm run build      # tsc -> dist/
npm start          # node dist/index.js
npm run dev        # ts-node src/index.ts
```

Test: `npx @modelcontextprotocol/inspector node dist/index.js`.

## Zasady kodu

- **TypeScript strict**.
- **`@modelcontextprotocol/sdk` ^1.12.0**.
- **API MS jest oficjalne i darmowe** - bez throttlingu agresywnego, ale User-Agent z kontaktem.
- **Bez polskich znakow w commit messages**.
- **CHANGELOG bump przy zmianie kontraktu**.

## Czego NIE robic (twarde reguly)

- **NIE buduj profili osob fizycznych** w samym konektorze - `get_board` zwraca dane jak sa, agregacja "ktora osoba jest w ilu zarzadach" to ryzyko RODO (cel przetwarzania) i powinna byc w produkcie z odpowiednia podstawa.
- **NIE cachuj odpisow** - kazde wywolanie musi byc fresh (snapshot in time).
- **NIE pomijaj daty odpisu** w citation - "KRS na dzien YYYY-MM-DD" jest kluczowa informacja.
- **NIE dodawaj scrapingu** krs.ms.gov.pl - mamy oficjalne API.

## Zrodla prawdy

1. [README.md](./README.md)
2. [CHANGELOG.md](./CHANGELOG.md)
3. `src/index.ts`
4. [API KRS - Ministerstwo Sprawiedliwosci](https://api.krs.ms.gov.pl/swagger-ui/index.html) - upstream
5. [Krajowy Rejestr Sadowy - portal](https://krs.ms.gov.pl) - frontend uzytkownika

## Kompatybilnosc agentow

Standard [AGENTS.md](https://agents.md). Dla Claude Code dodatkowo plik [CLAUDE.md](./CLAUDE.md).

## Licencja

**MIT** - patrz [LICENSE](./LICENSE).

Cytowanie: *MateMatic Solutions (2026), mcp-krs - MCP server dla polskiego KRS, https://github.com/matematicsolutions/mcp-krs, MIT.*
