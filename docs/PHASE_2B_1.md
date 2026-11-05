# Phase 2B.1 delivery — local read-only indexer

## Implemented

- A separate Nest application-context worker with validated local-only Hardhat
  settings, read-method RPC allowlist, bounded requests/batches and failure backoff.
- Verified direct contract deployment import: manifest, ABI/artifact, receipt,
  creation transaction/address, runtime hash, owner, chain/genesis and Hardhat run.
- SQL migration 002: deployment incarnations, block/event canonical history,
  cursor/processing state and historical property creation identity.
- Deterministic event replay with exact arithmetic and fixed-block view/holder/
  native-balance reconciliation; atomic snapshot/cursor commits.
- PostgreSQL single-writer lock, idempotent restarts, interrupted-batch rollback,
  shallow reorg repair and explicit reset/deep-reorg acknowledgement.
- API status/freshness/provenance under `/api/v1/synchronization`, property responses
  and health readiness. Known invalid/orphan snapshots are hidden; old metadata
  stays attached to its original UUID. API readiness remains DB/schema readiness.

## Changed files

| Area | Files |
| --- | --- |
| Worker | `apps/api/src/indexer/{config,rpc,identity,projection,worker,main}.ts` |
| Sync API | `apps/api/src/indexer/synchronization.module.ts` |
| Persistence | `apps/api/src/database/indexer.entities.ts`, `entities.ts`, `data-source.ts` |
| Migration | `apps/api/src/database/migrations/1731100000000-indexer.ts`, `sql/002-indexer.up.sql`, `sql/002-indexer.down.sql` |
| API integration | `apps/api/src/app.module.ts`, `config/environment.ts`, `health/health.module.ts`, `networks/networks.module.ts`, `properties/properties.service.ts` |
| Tests | `apps/api/test/indexer.{unit,database,live}.test.ts`, `indexer.fixture.ts`; existing `unit.test.ts` and `database.test.ts` updated for the new migration/status |
| Tooling | Root `package.json`; API `package.json`, `package-lock.json`, `.env.example`, `scripts/copy-sql.cjs`; `.github/workflows/ci.yml` |
| Documentation | Root/API READMEs, `USE_CASES.md`, `docs/API.md`, `ARCHITECTURE.md`, historical `PHASE_2A.md`, new `INDEXER.md` and this delivery record |

Solidity, generated ABI content, React source/wallet flows, deployment scripts,
public network configuration and Compose are unchanged. API env secrets were not
read into logs or modified. No application database migration was run automatically.

## Architecture refinements and provenance gaps

The primary architecture's chain-ID/address deployment identity remains unique.
Resettable Hardhat runs additionally need verified deployment-instance identity.
Block/event rows therefore reference an instance. Historical property incarnations
also need their creation-block identity; otherwise a reused on-chain token ID could
inherit a previous listing's metadata. Migration 002 refines the old uniqueness
rule while retaining one canonical instance/token row and unmanaged-row uniqueness.

The local manifest already contains the necessary receipt transaction hash,
deployment height, deployer, compiler version and runtime hash. Deployment block
hash/genesis/Hardhat instance ID are obtained and verified against RPC. A reviewed
Git SHA/release reference is optional manual configuration; no release identity or
full compiler-source reproducibility proof is fabricated. Missing/stale artifacts
or receipts require local compile/deploy/review, not guessed overrides.

## Verification results

| Check | Result |
| --- | --- |
| Backend unit/HTTP tests | 14 passed |
| PostgreSQL integration tests | 23 passed (8 existing + 15 indexing tests) |
| Real Hardhat/PostgreSQL smoke | Passed: transactions, compiled worker restart, reorg, withdrawal and reset/rebind |
| SQL migration lifecycle | Fresh up, Phase 2A upgrade preserving data, rollback/reapply passed; unsafe history collapse correctly rejected |
| Existing contract tests | 19 passed |
| Existing frontend tests | 16 passed |
| Existing deployment configuration tests | 5 passed |
| Backend compile and frontend production build | Passed |
| Clean backend lockfile install/audit | Passed; 0 known vulnerabilities at verification time |

Verification used an isolated native PostgreSQL 16 test cluster and a separately
spawned Hardhat process on a temporary port. Application DB data, port-8545 node,
deployment manifest and `.env` were left intact. Temporary test resources were
cleaned up after verification. GitHub Actions includes these checks but a remote
workflow result requires pushing the branch.

## Startup and remaining work

Follow the [CMD startup/recovery guide](INDEXER.md). Install updated API dependencies,
start PostgreSQL, apply `npm run db:migrate`, compile Solidity, ensure the current
local deployment manifest matches its running node, and start API/worker separately.
Existing API `.env` files can use worker defaults; do not overwrite credentials.

Local only: snapshots are cached, unfinalized observations of a trusted RPC. Full
history replay/view reconciliation is bounded and intended for a small demo, not
a production event pipeline. Public-chain finality/retries, incremental projection
scaling, durable holdings/activity queries, retention/metrics, SIWE, Studio write
workflows and optional frontend metadata consumption remain separate work. The
database never becomes the financial authority. No public deployment, mainnet,
real funds, Git commit or push was performed.
