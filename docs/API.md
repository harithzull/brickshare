# Phase 2A API: setup and reference

The optional service in `apps/api` is a NestJS/TypeScript modular monolith backed
by PostgreSQL 16 and TypeORM. It is a read-only metadata foundation. No indexer,
authentication, uploads, financial writes or frontend API dependency is included.
The React application continues to use its existing RPC and wallet flows.

## Local setup

Use the repository's Node 22 baseline and Docker with Compose v2, or an existing
PostgreSQL 16 instance. Run commands from the repository root.

1. Install backend dependencies:

   ```powershell
   npm run setup:api
   Copy-Item apps/api/.env.example apps/api/.env
   ```

2. Edit the ignored `apps/api/.env`. Set a new local `POSTGRES_PASSWORD` and put
   the same password into `DATABASE_URL`, replacing `CHANGE_ME`. URL-encode
   special characters in the URL password. `POSTGRES_USER`/`POSTGRES_DB` must
   match the URL; the default local host port is **5433**. Never reuse a signing
   key or copy the root deployment `.env` into this file.

3. Start PostgreSQL, migrate and seed public network configuration:

   ```powershell
   docker compose --env-file apps/api/.env up -d postgres
   docker compose --env-file apps/api/.env ps
   npm run db:migrate
   npm run db:seed:networks
   npm run dev:api
   ```

   Wait for the database to become healthy. The API listens at
   `http://127.0.0.1:3001`. No Hardhat node, wallet or RPC credential is required
   for these endpoints. An empty properties collection is the expected initial
   result: this service does not yet ingest contract listings.

4. Try the health and query endpoints in another terminal:

   ```powershell
   Invoke-RestMethod http://127.0.0.1:3001/health/live
   Invoke-RestMethod http://127.0.0.1:3001/health/ready
   Invoke-RestMethod http://127.0.0.1:3001/api/v1/networks
   Invoke-RestMethod http://127.0.0.1:3001/api/v1/properties
   ```

For a native PostgreSQL instance, create an application database/user yourself and
set `DATABASE_URL` accordingly; skip Compose. The local migration role needs DDL
permission in `DATABASE_SCHEMA` (default `public`). A custom schema must already
exist. No PostgreSQL extensions are required. `gen_random_uuid()` is built in.

`docker compose --env-file apps/api/.env stop postgres` preserves the database
volume. Changing Compose's password variables does not change credentials inside
an already initialized PostgreSQL volume; rotate the database role password
explicitly when necessary. Do not remove a volume containing data you need.

## Commands and environment

| Root command | Purpose |
| --- | --- |
| `npm run setup:api` | Install only the API package from its lockfile |
| `npm run dev:api` | Run TypeScript with Node watch mode |
| `npm run build:api` | Compile service/tests and copy SQL migration assets |
| `npm run start:api` | Run compiled `apps/api/dist/src/main.js` |
| `npm run db:migrate` | Apply pending SQL migrations transactionally |
| `npm run db:revert` | Undo the most recent migration; initial rollback deletes these six tables |
| `npm run db:seed:networks` | Insert missing configured public networks idempotently |
| `npm run db:seed:fictional` | Explicitly guarded fictional metadata fixture |
| `npm run test:api` | HTTP/configuration tests, no PostgreSQL required |
| `npm run test:api:db` | Real PostgreSQL migration, constraint and HTTP query tests |

The backend loads **only** `apps/api/.env`; existing process environment takes
precedence. Root deployment secrets and frontend Vite env files are separate.
Configuration validation rejects missing/placeholder database credentials,
invalid booleans/ports/schema names, database URL query options, unsafe asset
URLs and non-origin CORS entries. Failures redact configuration values.

`DATABASE_SSL=true` enables verified TLS; production requires it and HTTPS CORS
origins. Use a trusted database certificate/CA; do not disable verification.
`API_HOST` defaults to loopback; container hosts may set `0.0.0.0`.
`CORS_ORIGINS` is a comma-separated exact-origin allowlist without trailing slashes.
Empty CORS origins permit no cross-origin browser access. There are no cookies or
authenticated sessions. Connection acquisition and queries have bounded timeouts.

For a hosted API, provision PostgreSQL, inject environment through the host's
secret manager, build with development dependencies present, run migrations in a
controlled release step, and start the compiled API. Use a separate DDL migration
role and a read-only runtime role with SELECT on the six tables and migration
ledger. Automatic synchronization and startup migrations are disabled in **all**
environments. The API can start without a database: liveness stays available,
readiness returns 503 and database-backed endpoints return a redacted 503.

No API hosting/deployment automation is included. TLS termination, ingress rate
limits, backups/restoration, runtime role grants and monitoring need operator
configuration before exposing this foundation publicly.

## Fictional fixtures

Set `ALLOW_FICTIONAL_SEED=true` in the API env file and run:

```powershell
npm run db:seed:fictional
Invoke-RestMethod 'http://127.0.0.1:3001/api/v1/properties?source=fictional'
```

The seed refuses production and is idempotent. Its fictional Cedar House has
**no deployment, on-chain ID, supply, balance, price or observed block**. All those
columns are null and database constraints prevent attaching chain facts to it.
The real sample document is in `apps/api/fixtures/fictional-overview.txt`; the seed
computes its byte size and SHA-256. The API does not serve or upload this file.
Reset `ALLOW_FICTIONAL_SEED=false` after use. Never promote the fixture as a real
listing. Default queries exclude it; detail queries also require `source=fictional`.

## HTTP reference

| Endpoint | Behavior |
| --- | --- |
| `GET /health/live` | 200 when HTTP process is responsive; does not require DB |
| `GET /health/ready` | 200 when DB is reachable and known migrations are applied; otherwise 503 |
| `GET /api/v1/networks` | Enabled configured networks, numeric chain IDs encoded as strings; no RPC credentials |
| `GET /api/v1/properties` | Paginated properties in one explicit source, with published metadata/assets only |
| `GET /api/v1/properties/:id` | Property by internal UUID v4; 404 for missing record or wrong source |

Readiness reports `checks.database` as `ready`, `database_unavailable` or
`schema_pending`. It does not claim chain synchronization or validate every schema
object against drift. `synchronization` is always `not_implemented` in Phase 2A.

List query parameters:

| Parameter | Default / constraint |
| --- | --- |
| `source` | `blockchain`; alternative `fictional`; sources cannot be combined |
| `page` | 1; integer 1–10000 |
| `limit` | 20; integer 1–100 |
| `q` | Optional literal case-insensitive substring, max 100 characters; name/location and published metadata title/location |
| `location` | Optional exact chain/metadata location, max 160 characters |
| `deploymentId` | Optional UUID v4 of contract deployment row |
| `chainId` | Optional positive signed-bigint decimal string, e.g. `84532` |

Detail permits only `source`. Unknown parameters, duplicate array parameters,
invalid IDs and invalid types return 400. Queries use bound parameters; wildcard
characters in search text are treated literally. Results sort by created time,
then UUID. Offset pagination is suitable for this foundation and is not a
consistent snapshot across concurrent writes; activity cursors remain future work.

Example default collection after migration and network seed:

```json
{
  "data": [],
  "meta": {
    "source": "blockchain",
    "synchronization": "not_implemented",
    "blockchainAuthority": "wallet_and_smart_contract",
    "note": "No chain ingestion or independent snapshot verification is implemented by this API.",
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

Every property has `id`, `source`, `isFictional`, `fixtureLabel`, `blockchain` and
`metadata`. Fictional responses have `blockchain: null`. Blockchain rows, if
deliberately populated by a trusted future importer, expose stored identity,
name/location, supply, `tokenPriceWei`, active status and observed block/hash under
`blockchain`, labeled `source: unverified_database_snapshot`, `verifiedByApi: false`.
The API does not query RPC, certify freshness/finality, or calculate balances.
No command seeds fake deployments or chain-derived properties.

Chain IDs, on-chain IDs, blocks, token quantities, wei and asset byte sizes are
decimal **strings**. Addresses/hashes are normalized `0x` hex. Internal IDs are
UUIDs. Never convert wei or uint256 identifiers to JavaScript `Number`.

`metadata` is null when no published version exists. Otherwise it includes
`source: operator_metadata`, version, title, location, description, publication
state, timestamp and ordered public assets. Draft/archived metadata and assets are
excluded. Provenance references are not exposed as verified user identities.
With no `ASSET_PUBLIC_BASE_URL`, asset URL is null and availability is
`not_served_by_api`. An HTTPS base produces `configured_external_reference` URLs
from storage keys; this does not prove the file is hosted or available. Only
configure a base after uploading reviewed files matching their checksums.

Errors have `{ "error": { "status": 400, "message": [], "requestId": "uuid" } }`
(message is a string for some errors). Unexpected errors are 500 with a generic
message; unavailable DB/schema gives 503. Requests receive `X-Request-Id`,
`X-Content-Type-Options: nosniff` and `Cache-Control: no-store`. JSON logs contain
request ID, route template, method, status and duration. They omit query strings,
bodies, SQL, credentials and exception traces.

## Database tests

Create an empty dedicated test database; never point tests at application data.
For the local Compose database:

```powershell
docker compose --env-file apps/api/.env exec postgres createdb -U brickshare brickshare_api_test
# Set the URL using the local password in your terminal environment.
$env:TEST_DATABASE_URL = 'postgresql://brickshare:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5433/brickshare_api_test'
npm run test:api
npm run test:api:db
npm run build:api
Remove-Item Env:TEST_DATABASE_URL
```

The database name must end in `_test`. Integration tests create a random
`test_<uuid>` schema, migrate/rollback/reapply inside it, test constraints and real
HTTP queries, then remove only that schema. They never use `DATABASE_URL` as a
fallback. CI provisions an ephemeral PostgreSQL service and runs these same checks.

## Future frontend integration boundary

No frontend files or wallet flows change in this phase. When integrating later:

1. Add an optional public API base URL/feature flag; keep the current standalone
   frontend default. Backend failure must preserve current RPC browsing and wallet
   behavior, with honest missing-metadata messaging.
2. Match records by **chain ID + contract address + on-chain property ID**, never
   an internal UUID alone or token ID alone. A reviewed deployment registry and
   importer must establish this mapping first.
3. Use the API only for published descriptions/photos/public documents. Keep the
   current static metadata catalog as a separate fallback until migration is tested.
   API titles/locations must not silently replace authoritative contract facts.
4. Read price, supply, active status and connected-wallet balances from the
   selected contract; validate and sign purchases/transfers through the existing
   wallet. A database snapshot must never drive payment calculations.
5. Use bounded requests and cancellation on account/network/property changes;
   never replace real data with fictional source on API failure. Render metadata
   as text and validate external asset links, not arbitrary HTML.

Invest consumes public presentation reads. Studio will use future SIWE-authenticated,
scoped and audited draft/publication endpoints. Nothing in Phase 2A grants Studio
users contract ownership or on-chain permissions.
