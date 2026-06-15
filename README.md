# mcp-krs
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://modelcontextprotocol.io) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE) [![Node](https://img.shields.io/badge/Node-18%2B-brightgreen)](https://nodejs.org)

MCP server dla **Krajowego Rejestru Sądowego** przez oficjalne, darmowe
API Ministerstwa Sprawiedliwości (`api-krs.ms.gov.pl/api/krs`).

## Po co

Kancelaria pyta o kontrahenta → Patron zwraca pełne dane rejestrowe:
nazwa, forma prawna, NIP, REGON, adres, kapitał, **skład zarządu, sposób
reprezentacji, prokurenci**, główny PKD, status (aktywny / likwidacja /
upadłość). Plus URL do wyszukiwarki MS.

Krytyczne dla pracy nad umowami: pytanie „czy ta osoba może sama
podpisać tę umowę za spółkę X" sprowadza się do **dwóch ruchów** —
`krs__get_board` z numerem KRS, potem porównanie sposobu reprezentacji
ze stroną podpisującą.

## Tooly

- **`get_entity(krs, rejestr?)`** — odpis aktualny (pełne dane podmiotu).
- **`get_entity_full(krs, rejestr?)`** — odpis pełny (z historią wpisów).
- **`get_board(krs, rejestr?)`** — skrócona: tylko reprezentacja
  (sposób + skład) + prokurenci.

Parametry:
- `krs` — 1-10 cyfr, zera wiodące dopełniane automatycznie
  (`28860` → `0000028860`).
- `rejestr` — `P` (przedsiębiorców, default) lub `S` (stowarzyszeń).

Każda zwrotka zawiera `structuredContent.citations` z polami:
`title`, `url` (MS wyszukiwarka), `krs`, `nazwa`, `nip`, `regon`,
`forma_prawna`, `status`, `miejscowosc`, `sad_rejestrowy`, `rejestr`.

Patron czyta pole automatycznie i wystawia w panelu UI jako sekcję
**„Krajowy Rejestr Sądowy (KRS — MS)"**.

## Stack

- Node 18+ (wbudowany `fetch`)
- `@modelcontextprotocol/sdk`
- Stdio transport
- Throttle 500 ms (2 req/s) — MS API tolerancyjne ale grzecznie

## Build + uruchomienie

```bash
npm install
npm run build
node dist/index.js
```

## Wpięcie do Patrona

W `patron/backend/mcp-servers.json`:

```json
{
  "name": "krs",
  "transport": "stdio",
  "command": "node",
  "args": ["C:/Users/<TWOJ-UZYTKOWNIK>/mcp-krs/dist/index.js"],
  "enabled": true
}
```

## Smoke test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"s","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_board","arguments":{"krs":"28860"}}}' \
  | node dist/index.js
```

Powinno zwrócić ORLEN SA, sposób reprezentacji „dwaj członkowie zarządu
działający łącznie", skład zarządu, prokurenci + URL.

## Uwagi RODO

API MS w odpowiedziach zwraca **zamaskowane** dane osobowe członków
zarządu (gwiazdki w nazwiskach po nowelizacji 2023). Patron przepuszcza
to surowo, nie demaskuje. Dla pełnych nazwisk: użytkownik kancelarii
otwiera link MS w przeglądarce po zalogowaniu.

## Lineage

Kontrakt API z oficjalnej dokumentacji
[MS api-krs.ms.gov.pl](https://api-krs.ms.gov.pl). Implementacja TS od zera.

## Licencja

MIT.

## Part of the MateMatic legal stack

This server is one of five MCP connectors covering Polish jurisdiction +
EU law, used by [Patron](https://github.com/matematicsolutions/patron)
(AGPL-3.0) and any other MCP-aware legal AI agent.

- **mcp-krs** (this repo) — Polish company registry (official MS API)
- [mcp-saos](https://github.com/matematicsolutions/mcp-saos) — common courts, SN, TK, KIO
- [mcp-nsa](https://github.com/matematicsolutions/mcp-nsa) — NSA + 16 WSA administrative courts
- [mcp-isap](https://github.com/matematicsolutions/mcp-isap) — Polish legislation (Dz.U. + M.P.)
- [mcp-eu-sparql](https://github.com/matematicsolutions/mcp-eu-sparql) — EU law + CJEU (EUR-Lex)


All five MCP servers share the same `structuredContent.citations`
contract: each tool returns an array of `{title, url, snippet?, ...metadata}`
that legal agents can render directly in their citation panel.

See [matematicsolutions/.github](https://github.com/matematicsolutions)
for the full org profile.
