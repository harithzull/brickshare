# Phase 2B.1 — Local read-only indexing worker

The optional worker observes **one non-forked local Hardhat chain (31337) per
database**. It writes rebuildable PostgreSQL snapshots, never transactions to the
chain. React continues reading RPC and signing transactions independently.
Base Sepolia/public indexing, auth, uploads, holdings APIs and cloud deployment
are outside this phase.

Phase 2B.2 adds optional frontend consumption of published metadata with independent
RPC provenance checks and fallback. See [full-stack setup](PHASE_2B_2.md).
The live smoke test now also runs the real Nest API and frontend typed client and
requires frontend dependencies (`npm ci --prefix react-frontend`).

## Start locally (Windows CMD)

Keep the API `.env` and existing PostgreSQL volume from Phase 2A. Do not overwrite
that file with the example. New worker settings have defaults; no signing key is
needed. Start Docker Desktop first.

```cmd
npm run setup:api
docker compose --env-file apps/api/.env up -d postgres
npm run db:migrate
npm run db:seed:networks
```

`db:migrate` applies the new `Indexer1731100000000` migration. Restart the API
after updating code. The migration does not synchronize a chain or erase metadata.

In terminal 1, start Hardhat if it is not already running:

```cmd
npm run node
```

In terminal 2, compile the existing Solidity contract:

```cmd
npm run compile
```

If the current Hardhat node does not yet have a matching deployed contract, run
`npm run deploy:local`. If a valid contract is already deployed on this running
node, keep it: do not redeploy merely to restart the worker. Deployment produces
the ignored `react-frontend/src/generated/deployment.json` manifest. The worker
only reads that file and the compiled artifact; it never edits them.

Start the API in terminal 2:

```cmd
npm run dev:api
```

In terminal 3, start the worker:

```cmd
npm run dev:indexer
```

Or catch up and exit: `npm run indexer:once`. It runs as many bounded batches as
necessary, then exits when caught up to the last observed head. A failed tick
exits nonzero. If another worker owns the chain lock, the once command logs
`indexer_lock_unavailable` and exits nonzero without claiming it synchronized.

In terminal 4:

```cmd
curl.exe http://127.0.0.1:3001/api/v1/synchronization
curl.exe http://127.0.0.1:3001/health/ready
curl.exe http://127.0.0.1:3001/api/v1/properties
```

Create/buy/transfer/change listing status using the existing frontend and local
wallet. After the next worker poll, snapshots should match the contract at the
reported block. An empty chain has an empty property list even when synced.
Stop a worker with Ctrl+C; PostgreSQL retains its cursor and history. On restart
with the same chain/deployment, processing resumes without double-counting.
For compiled execution: `npm run build:api`, then `npm run start:indexer`.

## Validated settings (apps/api/.env)

| Setting | Default / meaning |
| --- | --- |
| `INDEXER_RPC_URL` | `http://127.0.0.1:8545`; HTTP loopback only, no credentials, query, redirect or remote host |
| `INDEXER_CHAIN_ID` | 31337 only; runtime RPC and Hardhat metadata must agree |
| `INDEXER_DEPLOYMENT_FILE` | `react-frontend/src/generated/deployment.json` |
| `INDEXER_ARTIFACT_FILE` | `artifacts/contracts/RealEstateTokenization.sol/RealEstateTokenization.json` |
| `INDEXER_POLL_MS` | 2000, range 250–30000; failures back off up to 30 seconds |
| `INDEXER_RPC_TIMEOUT_MS` | 5000, range 100–30000, per RPC request |
| `INDEXER_BATCH_SIZE` | 25 blocks, range 1–200 |
| `INDEXER_REORG_DEPTH` | 64 blocks, range 1–1000 |
| `INDEXER_MAX_PROPERTIES` | 1000, range 1–10000; bounded full reconciliation |
| `INDEXER_MAX_EVENTS` | 100000, range 1–1000000; bounded replay history |
| `INDEXER_STALE_AFTER_MS` | 30000, range 1000–3600000; API heartbeat freshness threshold |
| `INDEXER_ALLOW_LOCAL_REBIND` | false; explicit acknowledgement for replacing/resetting a local deployment incarnation |
| `INDEXER_RELEASE_REFERENCE` | Optional reviewed Git SHA/tag, up to 160 characters; blank means unknown |

File paths are relative to the repository root, including when running compiled
code. The worker refuses `NODE_ENV=production`, non-31337 chains, forked Hardhat
nodes, and unavailable `hardhat_metadata`. Do not point multiple independent
Hardhat nodes with the same chain ID at one database. A chain-wide advisory lock
serializes workers and reset handling across contract addresses.

The worker's PostgreSQL role needs SELECT/INSERT/UPDATE on the catalog/indexer
tables and SELECT on the migration ledger; it does not need DDL or schema-sync
permission. Keep the HTTP API role SELECT-only when separating runtime roles.

The worker reads only `apps/api/.env` and process environment, never the root
deployment secrets. Current API `.env` files need not add every setting; omitted
values use these defaults. Restart the worker after changing settings or manifests.

## Deployment provenance

Before import and on each tick, the worker verifies:

- Manifest contract name, local network/chain ID, compiler version, address,
  deployment block, transaction hash, deployer and expected runtime hash.
- Compiled artifact runtime hash and ABI agreement with the committed frontend ABI.
- RPC chain ID, non-forked Hardhat instance ID, and genesis hash.
- Successful canonical deployment receipt, contract address, sender and block hash.
- Creation transaction, direct CREATE address/nonce and exact constructor bytecode.
- Runtime bytecode at deployment and current head; observed owner at deployment.

The current deployment script supplies address, receipt transaction hash/block
number, deployer, compiler version and runtime hash. **Deployment block hash and
Hardhat instance ID are derived from RPC**, not guessed. An optional Git release
reference is manual: the current manifest does not prove a Git commit, reproducible
compiler input/source verification, real property title or investor eligibility.
The stored `artifact_hash` continues to mean expected deployed-runtime hash;
`deployment_instances.abi_hash` separately identifies the decoder ABI.

If the manifest or compiled artifact is missing, compile/deploy locally as above.
If the receipt is missing or bytecode/ABI differs, stop and correct the provenance;
do not edit a block number or invent a receipt to bypass checks. This phase accepts
the current direct deployment of this contract, not proxy/factory deployments.

## Persistence and recovery

Migration 002 adds four tables:

| Table | Responsibility |
| --- | --- |
| `deployment_instances` | Immutable identity/provenance for each Hardhat run/deployment fingerprint; at most one active instance per chain/address deployment |
| `chain_blocks` | Per-instance block/hash/parent/timestamp history; one canonical hash per height |
| `chain_events` | Ordered raw topics/data, decoded exact payload, tx/log identity and canonical state |
| `indexer_cursors` | Atomic watermark/hash, last observed head, status, revision, error code, reorg count and heartbeat |

`contract_deployments` retains unique chain/address identity. Its provenance is
updated only after verification/rebind; old provenance remains on historical
instances. `properties` gains instance ID, creation block hash and canonical flag.
Unmanaged Phase 2A rows retain their old uniqueness rule. Managed rows retain
historical creation identities, with only one canonical property per instance/token
ID. This deliberately refines Phase 2A's deployment/token uniqueness: a reset or
reorg may reuse a token ID for a different listing. Metadata stays attached to the
original property UUID and is never copied to the replacement.

Blocks/events are scoped to deployment instances rather than only public chain
ID, so local resets cannot collide. This may duplicate block rows for multiple
contracts; chain-wide shared block storage is future optimization.

Each tick:

1. Acquire the PostgreSQL session advisory lock; compare Hardhat run identities.
2. Verify/import deployment provenance. A reset invalidates old local instances
   across addresses, including when a new manifest points to a different address.
3. Compare the stored cursor hash to RPC. For a shallow reorg, find a retained
   common ancestor within the configured depth, including the pre-deployment block.
4. Read a bounded block/log range, validate parent/hash links and deduplicate log
   identities. Replay preceding canonical events plus the new range deterministically.
5. At a fixed end block, reconcile `propertyCount`, `owner`, every `getProperty`,
   observed-holder `getTokenBalance`, supply invariants and public native balance.
   Creation credits no owner holdings; self-transfer has zero net effect. Values
   stay exact bigint/decimal strings. Holder maps exist only during reconciliation;
   no holdings/financial tables or APIs are added.
6. Recheck anchor hash and Hardhat instance identity. In one transaction mark
   orphan history noncanonical, upsert blocks/events, invalidate replaced snapshots,
   write reconciled properties and advance the cursor. Recheck before commit.

Database errors, interruption or failed reconciliation roll back the whole batch.
If a known reorg repair fails, the old orphaned snapshots are hidden until retry
succeeds; the cursor and raw history remain available for recovery.
Restart retries from the last committed watermark; unique constraints prevent
duplicate logs/properties. Old noncanonical history is retained. RPC and PostgreSQL
cannot commit atomically together: the next poll rechecks the persisted hash, and
API responses explicitly describe cached, unfinalized observations.

No background RPC call executes a signing or mutation method: the transport has
an explicit read-method allowlist. Public `eth_getBalance` avoids the contract's
owner-only balance view; the worker never impersonates the owner. Unexpected
forced ETH or missing events causes reconciliation to stop rather than fabricate
a balance. API output contains no wallet ownership/profile associations.

## Reset or deep-reorg procedure

If Hardhat restarts/resets, or a reorg exceeds the retained search depth:

1. The worker invalidates affected snapshots/history and exposes a reason such as
   `reset_requires_rebind`, `deployment_invalid` or `reorg_too_deep`. Invalidated
   snapshots are excluded from public list/detail queries; metadata is preserved.
2. Stop the worker. Confirm which local node and deployment you intend to use.
   After reset, deploy locally again if the previous contract no longer exists.
   Ensure its manifest and compiled artifact describe the current chain.
3. Set `INDEXER_ALLOW_LOCAL_REBIND=true` in the API `.env` and run
   `npm run indexer:once`. This acknowledges local replacement/replay; it does not
   bypass receipt/bytecode/chain verification.
4. Inspect `/api/v1/synchronization`, then restore the setting to `false` and
   restart `npm run dev:indexer`.

A new Hardhat run creates a separate instance and new property UUIDs. A deliberate
replay of the same verified incarnation retains creation IDs when still canonical.
Do not delete your database volume to fix a reset. Migration rollback is guarded:
if history contains multiple property incarnations for a deployment/token ID,
`db:revert` refuses to collapse them. Restore a reviewed pre-migration backup if a
true downgrade is needed.

## API synchronization and freshness

`GET /api/v1/synchronization` returns `mode: local_read_only`, `authority:
smart_contract` and per-instance entries. Each includes:

- Deployment/instance identity, active flag and `initializing`, `syncing`, `synced`,
  `error` or `invalidated` processing status.
- Decimal-string indexed block/hash, last observed head/lag, cursor revision;
  timestamps and small integer reorg count.
- `finalityPolicy: local-latest-unfinalized`, redacted error code, verified-at-import
  receipt/runtime/ABI provenance and nullable release reference.
- Freshness: `never_synced`, `catching_up`, `recently_checked`, `stale`, `degraded`
  or `invalidated`. `synced` alone does not prove a worker is still running.

Lag is against the **last observed** head, not a live RPC head. A heartbeat becomes
stale after the threshold; it cannot prove absolute chain freshness or finality.
Before a worker imports anything, status has `data: []`.

Property responses include the same status under `meta.synchronization` and for
each managed `blockchain.synchronization`. Managed sources are
`reconciled_local_chain_snapshot`; `verifiedByApi: true` means historical view/event
reconciliation at the reported block, never current price/finality or property-title
verification. Unmanaged rows remain explicitly unverified and are suppressed once
their deployment has managed history. Fictional rows keep `blockchain: null`.
Properties and synchronization metadata are read in a repeatable-read transaction.

`GET /health/ready` reports DB/migration readiness with synchronization details.
A stopped/degraded worker does not make this metadata API unhealthy or prevent
the frontend's independent RPC flow. Consumers must inspect freshness separately.
The API never contacts RPC itself. Financial transaction calculations continue to
use the existing wallet/contract reads; database snapshots are never authoritative.

## Verification

Use a dedicated database ending in `_test`, created during Phase 2A setup. CMD:

```cmd
set "TEST_DATABASE_URL=postgresql://brickshare:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5433/brickshare_api_test"
npm run test:api
npm run test:api:db
npm run compile
npm run test:indexer:live
npm run build:api
```

The live test requires root Hardhat dependencies (`npm ci`) and compiled artifacts.
It starts its own RPC on a temporary port, deploys a test contract and exercises
test-only transactions/reorg/reset, starts the compiled worker twice, then stops
its node and removes its random test schema/temp files. It does not reset your
port-8545 node or rewrite your deployment manifest. GitHub Actions runs the same
checks against an ephemeral PostgreSQL service.

## Remaining work

Public-chain finality and RPC retry policy; scalable incremental projections and
reconciliation scheduling; durable holdings/activity APIs; event cursors; deployment
administration; metrics/retention; SIWE/Studio publication; optional React API
metadata integration. None of these changes contract permissions or introduces
custody, mainnet deployment or real investor funds.

Protocol references: [Hardhat network/reset API](https://v2.hardhat.org/hardhat-network/docs/reference),
[Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/).
