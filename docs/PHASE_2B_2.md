# Phase 2B.2 — Frontend/backend integration

React optionally consumes the NestJS indexed catalog and published metadata. RPC
remains authoritative for every financial and wallet field. The application works
without the API. No contract, purchase calculation, transfer/signing logic, network
selection, authentication or write API is changed.

## Actual API contract

| Endpoint | Frontend use |
| --- | --- |
| `/api/v1/networks` | Confirm the selected chain is enabled |
| `/api/v1/synchronization` | Resolve deployment/instance identity, freshness and provenance; no separate deployment-detail route exists |
| `/api/v1/properties?source=blockchain&chainId=...&deploymentId=...` | Read indexed catalog pages and published metadata |
| `/api/v1/properties/:uuid?source=blockchain` | Refresh selected details through an already matched internal UUID |

Property UUIDs differ from on-chain IDs. Blockchain quantities/blocks remain decimal
strings. Metadata can be null; asset URLs can be null because the API does not host
files. Sync lag is against the worker's last observed head, not a live head.

The TypeScript client includes runtime response validation. `tsconfig.api.json`
checks this boundary without migrating existing React code; builds run that check.
Tests use the supported Node 22.19 native erasable TypeScript support. Vite compiles
browser TypeScript normally.

## Identity, freshness and data sources

Each load selects exactly one active sync entry matching **chain ID + contract
address**. Properties additionally match **on-chain property ID**, deployment UUID
and instance UUID. Names never establish identity. Only a recently checked,
caught-up, active worker with an acceptable heartbeat age is eligible.

The frontend checks receipt address/status/block, deployment block/hash, current
runtime bytecode hash, genesis hash, indexed block/hash and Hardhat instance against
the selected RPC. This rejects metadata from local resets even when an address is
reused. The small backend addition exposes its already stored public
`hardhatInstanceId` and `genesisHash` under synchronization provenance. Older APIs
without these fields fall back to RPC until restarted. No new migration is needed.

The client loads up to ten pages/1000 records, rejects duplicates, changed totals,
conflicting watermarks and identity mismatches, then refreshes selected detail.
Only whitelisted description, published media/document links, captions and alt
text enrich RPC listings. Published titles are separately labeled in details;
contract names and locations are preserved.

| Data | Source |
| --- | --- |
| Listing existence/name/location | Existing Solidity RPC catalog; API-only records do not create tradable rows |
| Price, total/available supply, active status | RPC; API snapshots never overwrite these fields |
| Wallet holdings, treasury balance, activity | Existing RPC/event reads; wallet addresses are not sent to the API |
| Payment, gas review, signing, transfers and administration | Existing ethers.js/MetaMask orchestration and contract checks |
| Published descriptions/images/documents | PostgreSQL API after identity/freshness checks |
| Missing API content/assets | Explicitly local metadata catalog, then empty states/labeled illustrations |
| Fictional samples | Existing separately selected sample catalog; never an API failure fallback |

RPC listings appear immediately. Metadata loading/failure never sets transaction
busy state or blocks wallet connection. Failed RPC reads cannot be replaced by
tradable API-only snapshots. The financial math module is unchanged.

The UI labels metadata source/version, indexed block and local unfinalized status,
missing publication/hosting, and the time financial values were last read from RPC.
**Refresh listings** reloads RPC; **Retry metadata** affects API/provenance reads only.
Metadata is polled every 15 seconds by default; a one-second UI timer removes expired
API metadata even without navigation. Stale, degraded or catching-up observations
are withheld. API failure returns to local metadata/empty states. Nothing is cached
in localStorage. Obsolete loads are cancelled on listing/account changes, detail
selection or sample mode; late results cannot replace current context. Already
issued ethers RPC calls are not physically cancellable, but their obsolete results
cannot update the load.

Changes between polls are detected on the next check. Accepted observations are
cached/unfinalized, never transaction authority. Legacy local metadata is manually
maintained and is not proof of title or association after a reset.

## Public configuration

Preserve existing settings in `react-frontend/.env.local`, add these public values,
and restart Vite:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:3001
VITE_API_TIMEOUT_MS=3000
VITE_API_MAX_AGE_MS=30000
VITE_API_POLL_MS=15000
```

| Setting | Default and bounds |
| --- | --- |
| `VITE_API_BASE_URL` | Blank disables integration; origin/optional hosting prefix |
| `VITE_API_TIMEOUT_MS` | 3000; 100–10000 ms per request |
| `VITE_API_MAX_AGE_MS` | 30000; 1000–300000 ms worker heartbeat age |
| `VITE_API_POLL_MS` | 15000; 5000–60000 ms poll interval |

The whole operation is bounded to three request timeouts, capped at 15 seconds,
including pagination/provenance reads. Fetch uses GET, `credentials: omit`, no-store
and rejected redirects. Errors hide response bodies/SQL/credentials. URL credentials,
query strings and fragments are rejected. HTTP is allowed only for loopback in
localhost mode; other API URLs require HTTPS. Invalid build configuration fails
the build; runtime configuration errors preserve RPC browsing.

Never put database URLs, private keys, access tokens or privileged RPC credentials
in Vite variables. The current worker supports localhost only; keep
`VITE_API_BASE_URL=` in testnet configuration. Existing Base Sepolia network and
wallet behavior remains unchanged.

API asset links require external HTTPS without credentials. Operator text is rendered
as text, never HTML. Broken images fall back to labeled illustrations. Configured
links do not prove files exist or authenticate their contents. Hosting and authorized
publication remain future work.

## Full local setup (Windows CMD)

Use Node 22.19+ in the Node 22 line and open Docker Desktop. From the repository root,
a fresh checkout needs:

```cmd
npm run setup
npm run setup:api
```

For an existing setup, update frontend dependencies with
`npm ci --prefix react-frontend` and API dependencies with `npm run setup:api`.
On Windows, stop the frontend dev server before reinstalling dependencies so its
native esbuild/Rollup files are not locked.
Preserve your ignored API env file. If absent, create it with
`copy apps\api\.env.example apps\api\.env`; choose a local password and set matching
`POSTGRES_PASSWORD` and `DATABASE_URL` values.

```cmd
docker compose --env-file apps/api/.env up -d postgres
docker compose --env-file apps/api/.env ps
npm run db:migrate
npm run db:seed:networks
npm run compile
```

Wait for PostgreSQL to be healthy before migrating. This phase adds no schema, but
the Phase 2B.1 migration must already be applied.

| Terminal | Commands |
| --- | --- |
| 1: chain | `npm run node`; retain an already-running local node |
| 2: deployment, then API | If this node has no matching contract, `npm run deploy:local`; then `npm run dev:api` |
| 3: worker | `npm run dev:indexer` |
| 4: frontend | Configure the public API URL above, then `npm run dev` |

Do not redeploy an existing valid contract just to restart services. After a reset,
follow [indexer recovery](INDEXER.md#reset-or-deep-reorg-procedure). Open Vite's
printed URL. Create a property through the existing administrator/wallet flow if
the chain is empty. Published API metadata appears only when an actual indexed
property has a published metadata version; no publication write API exists yet.
The fictional seed cannot enrich a real listing because it has no chain identity.
Missing publication does not block wallet actions. The live automated test creates
an isolated published fixture to demonstrate the complete integration.

```cmd
curl.exe http://127.0.0.1:3001/health/ready
curl.exe http://127.0.0.1:3001/api/v1/synchronization
curl.exe http://127.0.0.1:3001/api/v1/properties
```

Stop the API to see explicit RPC fallback on the next metadata request. Stop the
worker and wait past the freshness threshold to see API metadata withdrawn. Wallet
transactions remain available while RPC works. Use Ctrl+C for foreground services;
stop PostgreSQL while keeping data with
`docker compose --env-file apps/api/.env stop postgres`.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| API metadata not enabled | Set frontend `VITE_API_BASE_URL`, restart Vite |
| Curl works but browser cannot connect | API `CORS_ORIGINS` must include the exact Vite origin; port 5174 differs from 5173. Restart API after editing |
| Windows npm ci reports EPERM on esbuild/Rollup | Stop the frontend dev server, then retry the install; do not delete database data |
| API refused/503 | Start DB/API; check readiness; `schema_pending` needs migration |
| Worker stale/behind/degraded | Start worker; inspect sync error/freshness and RPC |
| Deployment/block mismatch | Confirm frontend manifest/node/worker agree; restart updated services; use reset recovery instead of inventing IDs |
| No published metadata | `metadata: null` is expected until a version is published |
| Asset has no usable URL | API does not serve files; real HTTPS hosting and `ASSET_PUBLIC_BASE_URL` are needed |
| Index has a new listing but UI does not | Refresh RPC listings; API-only rows are not made tradable |
| API absent on Base Sepolia | Expected; leave API configuration blank and retain testnet RPC |
| Old descriptions remain on API failure | They are labeled local presentation metadata, not verified API content |

## Verification and limits

```cmd
npm run test:frontend
npm run test:api
set "TEST_DATABASE_URL=postgresql://brickshare:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5433/brickshare_api_test"
npm run test:api:db
npm run test:indexer:live
npm test
npm run test:config
npm run build
```

The dedicated test DB must exist and end in `_test`; see [API setup](API.md).
The live test needs all three packages and compiled Solidity. It uses a temporary
Hardhat port, random schema, actual Nest API and frontend client. It checks published
metadata, exact RPC holdings/payment, stale status, wrong deployment and API outage,
plus worker restart/reorg/reset. It leaves application data and deployment files intact.

Limits: optional API opt-in; one local chain; 1000 indexed records; offset pagination
that retries changed totals; bounded full-catalog loads and polling, not subscriptions.
Detail refresh requires a catalog identity match. There is no API-only financial
browsing on RPC failure, durable holdings API, authenticated publishing or uploads.
Manual browser-extension testing remains useful; automated wallet tests simulate
EIP-1193 and the cross-stack test uses a real isolated Hardhat chain.

Phase 2C should add SIWE, scoped Studio roles, audited draft/publication and controlled
assets. Separately plan scalable search/cursors, incremental indexing, public-chain
finality and dependency maintenance. Contract permissions/financial behavior need
their own explicit design before any change.

## Changed files and delivery checks

| Area | Files |
| --- | --- |
| Typed client and join | `react-frontend/src/lib/api-types.ts`, `api-client.ts`, `indexed-catalog.ts`; `tsconfig.api.json` |
| React loading | `src/hooks/useIndexedMetadata.js`, `useMarketplace.js`; `useBrickShare.js` only forwards optional mode/property identity |
| Source UI | `src/components/MetadataServiceStatus.jsx`, `PropertyMetadataStatus.jsx`, `PropertyCard.jsx`; `src/pages/PropertyDetailsPage.jsx`, `App.jsx`, `styles/properties.css` |
| API provenance | `apps/api/src/indexer/synchronization.module.ts`: two public fields from existing columns |
| Tests | Frontend API fixtures/client/catalog/React integration tests; expanded `apps/api/test/indexer.live.test.ts` |
| Configuration/tooling | Frontend package/lockfile, Vite API config validation, public env examples; CI installs frontend dependencies for the cross-stack smoke |
| Documentation | Root/frontend READMEs, architecture/API/indexer/delivery notes, metadata guide and use cases |

Delivery verification:

| Check | Result |
| --- | --- |
| Frontend tests and typed boundary | 36 passed, including 16 existing tests |
| Backend unit/HTTP tests | 14 passed |
| PostgreSQL integration tests | 23 passed |
| Real full-stack smoke | Passed: actual Nest API, worker/Hardhat, PostgreSQL publication, frontend client, fallback and existing reorg/reset checks |
| Existing deployment/transaction/build smoke | Passed; manifests/default build restored and no public transactions sent |
| Solidity tests | 19 passed |
| Deployment configuration tests | 5 passed |
| Production/testnet frontend builds | Passed; testnet uses a syntax-only fixture, never deployed |
| Frontend lockfile install | Clean `npm ci` passed in an isolated directory; workspace dependencies restored after a running dev-server binary lock |
| Frontend dependency audit | 22 entries, identical to the pre-change lockfile (12 low, 4 moderate, 6 high); Vite/ethers dependency maintenance remains separate work |

Tests used an isolated native PostgreSQL 16 cluster and temporary API/Hardhat ports.
No application database data or ignored env file was changed. Temporary resources
were removed after verification. There is no schema migration in this phase.
GitHub Actions is updated, but no remote CI result is claimed. No public deployment,
real funds, Git commit or push was performed for this phase.
