# Contributing

Most of this package is **generated from the OpenAPI spec** (`spec/openapi.json`). Do not edit `src/generated/*` by hand.

## Regenerate

1. Replace `spec/openapi.json` with the new spec.
2. `pnpm generate` (runs `scripts/generate.ts` with Node >= 22.18; no dependencies).
3. `pnpm typecheck && pnpm test`, and commit the regenerated `src/generated/*` together with the spec.

`src/generated/types.ts` holds the types, `operations.ts` the operation manifest (also consumed by the CLI and MCP server) and `client.ts` the namespaced client. Hand-written code lives in `src/runtime.ts`, `src/money.ts`, `src/meta.ts` and `src/index.ts`.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Releases

Tag `vX.Y.Z` on `main`. The release workflow publishes to npm with provenance via npm trusted publishing (OIDC; no token stored).
