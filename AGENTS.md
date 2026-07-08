# AGENTS.md - mcp-krs

An [agents.md](https://agents.md) standard file (Linux Foundation / Agentic AI Foundation) - canonical instructions for AI agents working with this repository. Read natively by Cursor, Codex (OpenAI), Jules (Google), Devin / Windsurf, Aider, Amp, Factory, GitHub Copilot.

## Project goal

An **MCP (Model Context Protocol)** server for the **Krajowy Rejestr Sadowy / KRS (National Court Register)** - via the official, free API of the **Ministerstwo Sprawiedliwosci (Ministry of Justice)** (`api.krs.ms.gov.pl`).

One of the 5 MateMatic Polish-law connectors ([`mcp-saos`](https://github.com/matematicsolutions/mcp-saos), [`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa), [`mcp-isap`](https://github.com/matematicsolutions/mcp-isap), [`mcp-krs`](https://github.com/matematicsolutions/mcp-krs) (this one), [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql)).

## MateMatic context (HARD CONSTRAINTS)

The repo is maintained by [MateMatic Solutions](https://matematicsolutions.com).

- **KRS data is public** but GDPR applies when combining it with other data (board = natural persons).
- **Every tool call MUST return `structuredContent.citations`** with: the KRS number, extract date, canonical URL (krs.ms.gov.pl).
- **Stateless** - no cache.
- **Current register or full historical only** - every extract has a snapshot date that must be in the citation. An outdated KRS = risk of a factual error.

## MCP tools (tools contract)

| Tool | Key parameters | Returns |
|---|---|---|
| `get_entity` | `krs_number` | current extract: name, NIP, REGON, status, share capital + citations |
| `get_entity_full` | `krs_number` | full historical extract (all changes since registration) |
| `get_board` | `krs_number` | current board + supervisory bodies (note: PII of natural persons) |

Full description: `src/index.ts` + `README.md`.

## Build and test

```bash
npm install        # Node 20+
npm run build      # tsc -> dist/
npm start          # node dist/index.js
npm run dev        # ts-node src/index.ts
```

Test: `npx @modelcontextprotocol/inspector node dist/index.js`.

## Code rules

- **TypeScript strict**.
- **`@modelcontextprotocol/sdk` ^1.12.0**.
- **The Ministry of Justice API is official and free** - no aggressive throttling, but include a User-Agent with a contact.
- **No Polish characters in commit messages**.
- **CHANGELOG bump on any contract change**.

## What NOT to do (hard rules)

- **DO NOT build natural-person profiles** in the connector itself - `get_board` returns data as-is; aggregating "which person sits on how many boards" is a GDPR risk (purpose of processing) and belongs in a product with an appropriate legal basis.
- **DO NOT cache extracts** - every call must be fresh (snapshot in time).
- **DO NOT omit the extract date** in the citation - "KRS as of YYYY-MM-DD" is critical information.
- **DO NOT add scraping** of krs.ms.gov.pl - we have an official API.

## Sources of truth

1. [README.md](./README.md)
2. [CHANGELOG.md](./CHANGELOG.md)
3. `src/index.ts`
4. [KRS API - Ministry of Justice](https://api.krs.ms.gov.pl/swagger-ui/index.html) - upstream
5. [Krajowy Rejestr Sadowy - portal](https://krs.ms.gov.pl) - user frontend

## Agent compatibility

The [AGENTS.md](https://agents.md) standard. For Claude Code there is an additional [CLAUDE.md](./CLAUDE.md) file.

## License

**MIT** - see [LICENSE](./LICENSE).

Citation: *MateMatic Solutions (2026), mcp-krs - MCP server for the Polish KRS, https://github.com/matematicsolutions/mcp-krs, MIT.*
