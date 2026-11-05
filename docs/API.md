# BrickShare API: setup and reference

The optional service in `apps/api` is a NestJS/TypeScript modular monolith backed
by PostgreSQL 16 and TypeORM. Public catalog reads retain the optional
Phase 2B.1 local indexing worker and Phase 2B.2 frontend metadata client.
Phase 2C adds SIWE authentication and organization/membership management; see the
[authentication API and CMD setup](PHASE_2C.md) for the implemented endpoints,
cookie/CSRF protocol, permissions and limitations. Uploads, property CMS writes
and financial writes are not included. The frontend does
not require this API to browse through RPC or transact.
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
   result until the optional worker runs. See [local indexing setup](INDEXER.md)
   to import a verified Hardhat deployment and reconcile contract listings.

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

For wallet sign-in, configure `AUTH_ORIGIN=http://127.0.0.1:5173` and include that
exact origin in `CORS_ORIGINS`. The frontend API URL and browser page must use
matching hostnames and schemes; mixing `localhost` and `127.0.0.1` prevents
SameSite cookies. Authentication mutations require JSON, an exact Origin,
`X-BrickShare-Auth: 1`, and (after nonce issuance) the appropriate CSRF token.
The private AuthClient supplies these headers; public catalog requests continue
to omit cookie credentials. Never put credentials in `VITE_` variables.

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
| `npm run dev:indexer` | Run the separate local read-only worker |
| `npm run indexer:once` | Catch up the local deployment and exit |
| `npm run start:indexer` | Run the compiled worker after building |
| `npm run test:indexer:live` | Isolated real Hardhat/PostgreSQL smoke test |

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
role and a read-only API runtime role with SELECT on the catalog/indexer tables and migration
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
| `GET /api/v1/synchronization` | Local worker processing state, provenance, watermark, observed lag and heartbeat freshness |

Readiness reports `checks.database` as `ready`, `database_unavailable` or
`schema_pending`. It does not claim chain synchronization or validate every schema
object against drift. `synchronization` now contains the local worker status object;
before import it has `mode: local_read_only`, `authority: smart_contract`, `data: []`.
DB readiness is independent of worker freshness. See [status semantics](INDEXER.md#api-synchronization-and-freshness).

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
    "synchronization": { "mode": "local_read_only", "authority": "smart_contract", "data": [] },
    "blockchainAuthority": "wallet_and_smart_contract",
    "note": "Cached local-chain observations may lag or be reorganized. Wallet and smart-contract reads remain authoritative.",
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

Every property has `id`, `source`, `isFictional`, `fixtureLabel`, `blockchain` and
`metadata`. Fictional responses have `blockchain: null`. Blockchain rows expose stored identity,
name/location, supply, `tokenPriceWei`, active status and observed block/hash under
`blockchain`. Worker-managed rows are labeled `reconciled_local_chain_snapshot`,
with deployment instance identity and synchronization status. `verifiedByApi: true`
describes reconciliation at the stored block, not current/finalized financial facts.
Unmanaged rows stay `unverified_database_snapshot`, `verifiedByApi: false`; they
are suppressed once that deployment has managed history. Invalidated/orphaned
managed properties are excluded; historical metadata remains in PostgreSQL.
The API itself does not query RPC, certify finality, or calculate balances.
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
Indexer integration tests additionally exercise atomic interruption/restart,
duplicate delivery, local resets, reorgs, constraints, provenance and freshness.
`npm run test:indexer:live` needs root Hardhat dependencies and `npm run compile`;
it starts its own disposable chain. See [indexer verification](INDEXER.md#verification).

## Frontend integration boundary

Phase 2B.2 implements this boundary; see [full-stack setup](PHASE_2B_2.md).
Wallet signing and financial calculations are unchanged:

1. `VITE_API_BASE_URL` opts into the public metadata client; blank keeps standalone
   RPC browsing. Timeouts, failures and missing metadata have explicit fallback labels.
2. Match records by **chain ID + contract address + on-chain property ID**, never
   an internal UUID alone or token ID alone. The local deployment registry and
   worker now record verified local deployment identity and isolated run/creation
   history. The frontend also checks receipt/runtime, genesis, Hardhat run and
   indexed block hashes. Public-chain indexing remains future work.
3. Use the API only for published descriptions/photos/public documents. Keep the
   current static metadata catalog as a separate fallback until migration is tested.
   API titles/locations must not silently replace authoritative contract facts.
4. Read price, supply, active status and connected-wallet balances from the
   selected contract; validate and sign purchases/transfers through the existing
   wallet. A database snapshot must never drive payment calculations.
5. Requests are bounded/cancelled across context changes. Metadata expires without
   navigation; fictional records never replace RPC data. Operator text is escaped
   and API asset URLs require external HTTPS without credentials.

Synchronization provenance now includes public `hardhatInstanceId` and `genesisHash`
from existing columns. This additive response change requires no database migration.
Restart older API processes before enabling the updated frontend client.

Invest consumes public presentation reads. Studio will use future SIWE-authenticated,
scoped and audited draft/publication endpoints. Nothing in Phase 2A grants Studio
users contract ownership or on-chain permissions.
