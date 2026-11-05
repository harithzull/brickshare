# BrickShare 2.0 — Phase 2A backend foundation

## Delivered structure

```text
apps/api/
  src/
    config/             Validated API-only environment
    common/             JSON logs, request IDs, validation and redacted errors
    database/
      entities.ts       Six TypeORM entity mappings
      migrations/       Explicit up/down SQL and migration adapter
      data-source.ts    PostgreSQL connection; synchronization always disabled
      seeds.ts          Public network seed and guarded fictional fixture
      cli.ts            Explicit migration/seed commands
    health/             Process liveness and DB/schema readiness
    networks/           Enabled public network configuration
    properties/         Paginated reads and published metadata
    assets/             Public reference presentation; no upload/storage access
  fixtures/             Clearly fictional public document
  test/                 Unit/HTTP and isolated real PostgreSQL integration tests
  scripts/              SQL build-asset copying
compose.yaml            Loopback-only PostgreSQL 16 with persistent volume
.github/workflows/ci.yml  Contracts, frontend, and backend PostgreSQL checks
```

## Architecture decisions and discrepancies

The primary specification is [ARCHITECTURE.md](ARCHITECTURE.md). Its broader design
remains the roadmap; Phase 2A intentionally implements only the read-only foundation.
The following adaptations were identified before implementation:

| Original proposal | Phase 2A decision |
| --- | --- |
| Chain natural `chain_id` primary key | UUID internal PK for all six entities as requested; public `chain_id bigint` remains unique |
| Deployment-scoped `/v1/.../:onChainId` routes | Requested `/api/v1/properties/:id` uses internal UUID; list filters support chain/deployment identity |
| Author/creator User FKs | Nullable unverified provenance strings until Users/Auth exist; no fake authenticated users |
| Chain-derived read models/indexer | No importer or RPC reads yet; snapshots explicitly unverified, default database starts empty |
| Fictional frontend catalog separate from chain projections | Explicit fictional DB source with all blockchain fields null, opt-in query/guarded seed |
| Public object storage lifecycle | Records/checksums and optional HTTPS references only; no upload or serving implementation |

No contract deployment is automatically imported from unverified manifests, and no
address, receipt, block or price is fabricated by the production seed commands.
Real-shaped snapshots exist only as isolated database-test fixtures.

## Schema and publication rules

- `chains`: UUID; unique positive bigint public chain ID; public explorer/name.
- `contract_deployments`: UUID; chain FK; unique chain/address; constrained 20-byte
  addresses and 32-byte hashes; deployment provenance and ABI/artifact identity.
- `properties`: UUID; unique deployment/on-chain ID; exact numeric(78,0) uint256
  bounds; supply and price constraints reflecting current contract creation rules;
  observed block/hash. Separate, constrained fictional source has no chain facts.
- `property_metadata_versions`: UUID; sequential per-property versions; unique
  version; at most one published version; published content immutable except
  archival; no deletion of version history. Draft content can be edited.
- `public_assets`: UUID; unique safe relative object key; allowed public MIME/kind;
  20 MiB maximum; byte size and SHA-256; published identity/content immutable.
- `property_assets`: UUID; version/asset FKs; unique pair; purpose, alt text,
  caption and display order. Attachments can change only on draft versions;
  image attachments require alt text and purpose must match the asset kind.

All tables include created/updated timestamptz and appropriate identity, lookup,
publication and relationship indexes. PostgreSQL triggers update timestamps and
protect version/content references. Indexes support future search/projection
work; current literal ILIKE queries are bounded but not optimized for large catalogs.

Future publication must archive the old published version before publishing its
replacement in the same transaction. Validate that all linked files are reviewed,
published and uploaded. Archiving an asset removes it from public responses but
retains historical links/checksums. Storage objects themselves must use immutable
keys; database checks cannot prevent an external operator overwriting a file.

No write API is exposed. SQL access is administrative; production runtime should
use SELECT-only credentials. There are no payment tables, investor identity files,
holdings projections, auth sessions or financial mutations in this phase.

## Verification and operation

See [API.md](API.md) for exact setup, endpoints, response contracts and commands.
Backend tests exercise validation, readiness, redaction, CORS, missing records,
real query filtering/pagination, fixture isolation, decimal precision, migration
up/down/reapply, FK/unique/check constraints and metadata reference protection.
The GitHub Actions backend job runs against an ephemeral PostgreSQL 16 service;
existing contract/frontend jobs are retained.

Verified locally for this delivery:

| Check | Result |
| --- | --- |
| Backend unit/HTTP/configuration tests | 8 passed |
| PostgreSQL 16 integration tests | 8 passed, including migration rollback/reapply and error recovery |
| Backend build and clean lockfile install | Passed |
| Migration/seed CLI and compiled HTTP startup smoke | Passed; 2 networks, 0 blockchain properties, 1 opt-in fictional fixture |
| Existing Solidity tests | 19 passed |
| Existing frontend tests | 16 passed |
| Existing deployment configuration tests | 5 passed |
| Existing frontend production build | Passed |
| Compose configuration validation | Passed |
| New backend dependency audit | 0 known vulnerabilities at verification time |

The Docker daemon was unavailable locally. Database verification used an isolated
native PostgreSQL 16 cluster instead; starting the Compose container itself remains
a local setup step. The temporary test service was stopped after verification.
GitHub Actions has been updated but cannot be claimed as remotely passed until
the branch is pushed and its workflow runs.

Manual setup remains: install API dependencies, configure an ignored API env file,
start/provision PostgreSQL, run migrations/network seed, and start the API. No
developer database password or actual deployment credential is supplied. Hosted
API configuration and the fictional seed are optional; see [API.md](API.md).

Dependencies are locked separately in `apps/api/package-lock.json`. TypeORM uses
explicit entity/migration classes rather than filesystem globs. Its transitive
`glob` is overridden to patched 14.0.3 to address dependency advisories; recheck
that override when updating TypeORM. Builds and real migration tests exercise this
dependency set. No repository-wide dependency upgrades are included.

## Remaining Phase 2B work

1. Import reviewed actual deployments with RPC chain/address/receipt/artifact
   checks; do not promote current unverified database snapshots into trusted data.
2. Add read-only event ingestion, canonical blocks/events, transactional cursors,
   replay/restart/reorg recovery and supply reconciliation against the existing ABI.
3. Add freshness/finality watermarks and deployment-scoped identity resolution;
   then integrate optional metadata API reads into React with tested RPC fallback.
4. Add SIWE sessions, verified user/wallet associations, scoped Studio roles and
   append-only publication auditing; migrate provenance references deliberately.
5. Implement authorized draft/publish workflows, immutable public storage keys,
   restricted upload completion/checksum validation and publication checks.
6. Expand operations: release migrations, least-privilege grants, TLS, rate limits,
   backups/restoration, structured failure metrics and indexing-lag monitoring.

Wallet signing, purchase/transfer calculations, contract permissions, local Hardhat
development and Base Sepolia deployment tooling remain unchanged. No mainnet
deployment, real funds, public hosting, Git commit or push is part of this delivery.
