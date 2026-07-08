# mcp-krs

## Installation (one command)

Published on npm + MCP Registry (`io.github.matematicsolutions/mcp-krs`). Run without cloning:

```bash
npx -y @matematicsolutions/mcp-krs
```

MCP client configuration (stdio):

```json
{ "mcpServers": { "mcp-krs": { "command": "npx", "args": ["-y", "@matematicsolutions/mcp-krs"] } } }
```

(Building from source - below.)

[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://modelcontextprotocol.io) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE) [![Node](https://img.shields.io/badge/Node-18%2B-brightgreen)](https://nodejs.org)

MCP server for the **Krajowy Rejestr Sadowy / KRS (National Court Register)** via the official, free
Ministerstwo Sprawiedliwosci (Ministry of Justice) API (`api-krs.ms.gov.pl/api/krs`).

## Why

A law firm asks about a counterparty -> Patron returns full register data:
name, legal form, NIP, REGON, address, share capital, **board composition, representation
rules, commercial proxies (prokurenci)**, primary PKD code, status (active / liquidation /
bankruptcy). Plus a URL to the Ministry of Justice search tool.

Critical for contract work: the question "can this person sign this contract
for company X on their own" reduces to **two moves** -
`krs__get_board` with the KRS number, then comparing the representation rules
against the signing party.

## Tools

- **`get_entity(krs, rejestr?)`** - current extract (full entity data).
- **`get_entity_full(krs, rejestr?)`** - full extract (with entry history).
- **`get_board(krs, rejestr?)`** - short form: representation only
  (rules + composition) + commercial proxies (prokurenci).

Parameters:
- `krs` - 1-10 digits, leading zeros padded automatically
  (`28860` -> `0000028860`).
- `rejestr` - `P` (entrepreneurs register, default) or `S` (associations register).

Every response contains `structuredContent.citations` with fields:
`title`, `url` (Ministry of Justice search), `krs`, `nazwa`, `nip`, `regon`,
`forma_prawna`, `status`, `miejscowosc`, `sad_rejestrowy`, `rejestr`.

Patron reads the field automatically and renders it in the UI panel as a
**"Krajowy Rejestr Sadowy (KRS - MS)"** section.

## Stack

- Node 18+ (built-in `fetch`)
- `@modelcontextprotocol/sdk`
- Stdio transport
- Throttle 500 ms (2 req/s) - the Ministry of Justice API is tolerant, but be polite

## Build + run

```bash
npm install
npm run build
node dist/index.js
```

## Wiring into Patron

In `patron/backend/mcp-servers.json`:

```json
{
  "name": "krs",
  "transport": "stdio",
  "command": "node",
  "args": ["C:/Users/<YOUR-USER>/mcp-krs/dist/index.js"],
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

Should return ORLEN SA, representation rules "two board members
acting jointly", board composition, commercial proxies (prokurenci) + URL.

## GDPR notes

The Ministry of Justice API returns **masked** personal data of board members
in its responses (asterisks in surnames after the 2023 amendment). Patron passes
this through raw, it does not unmask. For full surnames: the law-firm user
opens the Ministry of Justice link in a browser after logging in.

## Lineage

API contract from the official documentation
[MS api-krs.ms.gov.pl](https://api-krs.ms.gov.pl). TypeScript implementation from scratch.

## License

MIT.

## Part of the MateMatic legal stack

This server is one of five MCP connectors covering Polish jurisdiction +
EU law, used by [Patron](https://github.com/matematicsolutions/patron)
(AGPL-3.0) and any other MCP-aware legal AI agent.

- **mcp-krs** (this repo) - Polish company registry (official MS API)
- [mcp-saos](https://github.com/matematicsolutions/mcp-saos) - common courts, SN, TK, KIO
- [mcp-nsa](https://github.com/matematicsolutions/mcp-nsa) - NSA + 16 WSA administrative courts
- [mcp-isap](https://github.com/matematicsolutions/mcp-isap) - Polish legislation (Dz.U. + M.P.)
- [mcp-eu-sparql](https://github.com/matematicsolutions/mcp-eu-sparql) - EU law + CJEU (EUR-Lex)


All five MCP servers share the same `structuredContent.citations`
contract: each tool returns an array of `{title, url, snippet?, ...metadata}`
that legal agents can render directly in their citation panel.

See [matematicsolutions/.github](https://github.com/matematicsolutions)
for the full org profile.
