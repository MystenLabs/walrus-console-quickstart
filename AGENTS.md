# AGENTS.md

Repo: reference code for the Console REST API. Runs on Sui mainnet.

## Layout

- `README.md`, `QUICKSTART.md` — narrative docs. `QUICKSTART.md` §2 is the source
  of truth for SDK call shapes, package ids, and Seal config.
- `openapi.yaml`, `postman/` — curated API surface. `openapi.yaml` is authoritative
  for endpoint shapes, status codes, and required query/body params.
- `app/` — single pnpm project covering all four runnable surfaces:
  - `app/src/config.ts` — `NETWORK`: API host, fullnode, package ids,
    `BucketRegistry` id and Seal committee id.
  - `app/src/lib/{seal,console}.ts` — shared Seal + Console REST helpers.
  - `app/src/scripts/` — three helper CLIs (`sign-reserve`, `encrypt-file`,
    `decrypt-file`) + `full-round-trip.ts`.
  - `app/src/server/index.ts` — Hono backend exposing the flow over local HTTP.
  - `app/sample.txt` — round-trip plaintext.

## Conventions

- Package manager: **pnpm**. Node **>=22** (see `.nvmrc`).
- TypeScript, `NodeNext`, `strict`. Rely on global `fetch`, `FormData`, `Blob`,
  `crypto.getRandomValues`. Load `.env` via Node's built-in `--env-file` flag
  (wired through the pnpm scripts) — no `dotenv` dep.
- `app/` is a single pnpm project — scripts and server share `lib/`. The
  `pnpm-workspace.yaml` is config-only (sets `allowBuilds: esbuild: false`
  for pnpm v11); there are no workspace packages.
- SDKs: `@mysten/sui` ^2.x, `@mysten/seal` ^1.x. Hono + `@hono/node-server` for the server.
- Secrets via `.env` only. Never log them. Service key stays on the backend.

## Integration model

Backend-proxy: frontend → your backend → Console. Browsers cannot call Console
directly (CORS). Auth is `Authorization: Bearer hbr_…` plus a `suiprivkey1…` service
key that signs the reserve transaction and Seal decrypt sessions.

## Console specifics

- Reserve `bytes` is an Enoki-sponsored Sui transaction; sign with
  `keypair.signTransaction(fromBase64(bytes))`.
- All network-specific ids come from `NETWORK` in `app/src/config.ts`. Never
  hardcode a host or object id elsewhere.
- Encrypt + `SessionKey` use `NETWORK.originalPackageId` (canonical id — Seal pins identity
  derivation to it).
- `seal_approve` move-call target uses `NETWORK.latestPackageId::bucket_policy::seal_approve`
  with args `(vector<u8> id, &BucketRegistry, &PermissionedGroup)` — the shared
  `NETWORK.bucketRegistryId` object is a required argument since the August 2026 contract.
- Seal uses one committee `KeyServer` (`NETWORK.sealCommitteeObjectId`),
  weight 1, threshold 1. Key fetches go through Console's proxy at
  `{apiBase}/api/v1/seal/aggregator` with `apiKeyName: 'Authorization'` and
  `apiKey: 'Bearer hbr_…'`. The SDK appends `/v1/fetch_key`. Do not call the
  Seal aggregator directly: its credential lives on Console's backend.
- After Finalize the first upload (and the first `GET /buckets/{id}` metadata
  read) may return `403 mirror_missing_grant` while the ACL indexer catches up.
  Retry ~3s, ≤20 attempts.
- Reserve and Finalize report the bucket lifecycle as `provisioning_state`
  (`pending_policy` → `active`). File upload status still uses `state`.
- `GET …/files/{fileId}/download` can answer `307` to a user-content host.
  Follow redirects (`curl -L`; `fetch` follows them by default).
- Poll `…/files/{fileId}/status` until `state === "completed"` before download.
- `DELETE /api/v1/buckets/{id}` requires `?confirm=true`. A bucket that still holds
  files is refused with `400 bucket_not_empty` and a `file_count`; add
  `&deleteContents=true` to delete the files with it.

## Verify

From `app/`: `pnpm install && pnpm run typecheck`. Round-trip:
`pnpm run full-round-trip` must end with **MATCH**, file delete, bucket
delete, and `Round-trip OK.`. It also mints and redeems a signed download
URL and compares the bytes. Server smoke test: `pnpm start`, then
POST/GET/DELETE through the routes table in `app/README.md`.

When in doubt, re-read `QUICKSTART.md` §2.
