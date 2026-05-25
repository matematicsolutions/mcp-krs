# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
