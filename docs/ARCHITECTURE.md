# BrickShare 2.0 — Hybrid architecture

**Status:** Phase 2A implements the optional NestJS/PostgreSQL read-only foundation:
six catalog entities, explicit SQL migrations, metadata queries and health checks.
Authentication, chain ingestion, portfolio/activity projections, write APIs and
object storage remain proposed. See [Phase 2A decisions](PHASE_2A.md) for the
implementation scope/discrepancies and [API setup](API.md) for current endpoints.

## 1. Architectural decision

Keep the current React application and Solidity contract. Add a NestJS TypeScript
modular monolith with PostgreSQL for searchable presentation data, authenticated
off-chain administration, and event-derived read models. Run indexing as a separate
worker process from the same codebase. Start with PostgreSQL-backed work/checkpoints;
do not introduce a queue service until workload requirements justify it.

```text
Browser React ---- public reads ----> NestJS API ----> PostgreSQL
      |                                  |                ^
      | wallet-signed transactions       | public assets  | projections
      v                                  v                |
Browser wallet ---> selected chain     Object storage   Indexer worker ---> RPC
                    Solidity contract                  (read-only)
```

Phase 1 remains backend-independent: browser reads continue through the selected
RPC. A future API can accelerate browsing/history without becoming a custody or
transaction-signing service. The design applies to localhost and Base Sepolia;
mainnet is outside the current implementation scope.

## 2. Sources of truth and boundaries

| Data/action                                     | Authority                                  | Backend responsibility                                                          |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Token supply, price, active status              | Selected deployed contract                 | Index/cache with block provenance; never override                               |
| Wallet holdings and transfers                   | Chain state/events                         | Rebuildable projections and query endpoints                                     |
| Purchase payment and treasury withdrawal        | Wallet-signed contract transactions        | Observe receipts/events; never receive signing keys or impersonate owner        |
| Property creation/status changes                | Existing owner-signed contract calls       | Observe listing events; backend metadata roles grant no contract permission     |
| Description, authentic photos, public documents | Operator-maintained off-chain records      | Versioning, validation, storage, publication and audit trail                    |
| User sessions and verified wallet association   | Off-chain proof of wallet control          | Nonce/session verification; not identity or title verification                  |
| Reference portfolio value                       | Holdings multiplied by fixed listing price | Exact reference calculation labeled as such; no profit/market-value claims      |
| Fictional sample listings                       | Explicit frontend sample catalog           | Keep isolated; do not mix into chain projections or publish as real investments |

The current contract has unrestricted holder-to-holder transfers, no ownership
transfer function, and no rent/refund/campaign lifecycle. Adding off-chain roles,
eligibility records, or metadata cannot enforce different on-chain financial rules.
Any future contract change needs a separate design and explicit migration plan.

## 3. Proposed NestJS modules

| Module           | Boundary                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| ConfigModule     | Validated startup configuration; server secrets never returned to clients |
| NetworksModule   | Supported public networks and reviewed deployment identities              |
| AuthModule       | SIWE challenges, signature verification, sessions and revocation          |
| UsersModule      | Minimal user profile and verified wallet associations                     |
| PropertiesModule | Searchable chain-derived listings plus published metadata                 |
| AssetsModule     | Public image/document records and controlled storage lifecycle            |
| PortfolioModule  | Holdings/reference allocation queries from consistent projections         |
| ActivityModule   | Canonical purchase/transfer activity with cursor pagination               |
| IndexerModule    | Read-only chain ingestion, checkpoints, reconciliation and reorg recovery |
| AdminModule      | Authorized off-chain metadata publication and audit history               |
| HealthModule     | API/database readiness and indexing lag/degraded-state reporting          |

Use typed DTOs and validation at the API boundary, service-owned transactions,
and repository interfaces for persistence. Proposed database adapter: Nest's
TypeORM integration with reviewed SQL migrations. Disable automatic schema
synchronization in hosted environments. Keep domain calculations independent of
ORM floating-point conversions. See [Nest database integration](https://docs.nestjs.com/techniques/database).

## 4. Entity model

The six network/property/asset tables below are implemented in Phase 2A; identity,
authentication and projection tables remain **proposed**. Internal IDs are UUIDs;
a property's on-chain ID is a separate uint256. Never identify a property by token ID alone.

### Identity, authentication and administration

| Entity        | Key fields and constraints                                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User          | UUID PK; created/updated timestamptz; account status; optional display name. Avoid collecting unnecessary personal data.                                                                                                          |
| Wallet        | UUID PK; user FK; address `bytea(20)` enforced by length check; unique address; association verified-at timestamp. Wallet addresses are cross-chain identities, with chain-specific authorization checks.                         |
| AuthChallenge | UUID PK; requested address; hash of random nonce; expected domain/URI and allowed chain; expiry; consumed-at. Single-use consumption must be atomic. Do not create a trusted user association merely from requesting a challenge. |
| Session       | UUID PK; user/wallet FK; hash of session token; issued/expiry/revocation timestamps. No raw token in logs or DB.                                                                                                                  |
| OperatorGrant | User FK; deployment FK; content role; created/revoked timestamps; unique active grant per scope. Off-chain content rights only.                                                                                                   |
| AdminAuditLog | UUID PK; actor verified wallet/user; deployment; action; metadata version; request ID; timestamp; structured change summary without secrets. Append-only to application operators.                                                |

PostgreSQL uses `bytea` plus `CHECK(octet_length(address)=20)`, not a literal
`bytea(20)` type declaration. The notation in tables describes the required width.
Apply equivalent 32-byte constraints to hashes.

### Networks and properties

| Entity                  | Key fields and constraints                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chain                   | UUID PK; unique positive `chain_id bigint`; public name/explorer; enabled flag. Privileged RPC credentials stay in process configuration, not public rows. |
| ContractDeployment      | UUID PK; chain FK; 20-byte address; deployment block/hash; 32-byte transaction hash; ABI/artifact version and hash; observed owner address; release reference; unique `(chain_id,address)`.              |
| Property                | UUID PK; source; deployment FK; `on_chain_id numeric(78,0)`; chain-derived name/location/total/available/priceWei/active; observed block/hash; unique `(deployment_id,on_chain_id)`. Fictional fixtures have all chain fields null. |
| PropertyMetadataVersion | UUID PK; property FK; sequential version; description/title/location; draft/published/archived state; nullable unverified author reference (future User FK); timestamps; unique `(property_id,version)`; at most one published version. |
| Asset                   | UUID PK in `public_assets`; public object-storage key; MIME type, byte size, checksum, kind, publication state; nullable unverified creator reference (future User FK). Public files only. |
| PropertyAsset           | UUID PK; metadata-version FK + asset FK unique pair; purpose, alt text, caption, display order. Published historical references are immutable. |

Chain-derived properties may exist without operator metadata. Present missing
descriptions/documents honestly and retain labeled illustrations as fallback.
Do not mutate name/location/price in the chain-derived row through metadata APIs.

### Events, projections and chain progress

| Entity               | Key fields and constraints                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChainBlock           | Chain FK; block number/hash/parent hash; chain timestamp; canonical flag. Unique `(chain_id,block_hash)` plus a partial unique index on canonical `(chain_id,block_number)`. Retain sufficient recent ancestry for reorg checks.                      |
| ChainEvent           | Deployment FK; block number/hash; tx hash; log index; event type; topics/raw decoded payload; canonical flag; ingestion timestamp. Unique `(deployment_id,block_hash,tx_hash,log_index)` so replay is idempotent and re-inclusion can be represented. |
| Holding              | Property FK + 20-byte holder address composite PK; `tokens numeric(78,0)`; projection block/hash. Include holders who have never signed into the app; no User FK is required.                                                                         |
| IndexerCursor        | Deployment PK; last scanned block/hash; projection watermark; configured finality policy; last success/error timestamps; lease/version for a single active writer.                                                                                    |
| SubmittedTransaction | Optional UUID PK; deployment; tx hash; submitted-by verified wallet; user-reported submission time; independently observed receipt/status. Unique `(chain_id,tx_hash)`. Treat client submissions as hints, never proof of purchase or rights.         |

Use exact `numeric(78,0)` for uint256 values with nonnegative and upper-bound
checks (`<= 2^256 - 1`). Block numbers fit `bigint`; JavaScript responses still
serialize them deliberately. Avoid floats for wei, supplies, token balances,
or stored financial totals. PostgreSQL documents [exact numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html).

JSON responses encode token quantities, wei, and large identifiers as decimal
strings. Addresses/hashes use normalized hex, with checksum formatting available
for display. Use timestamptz for server/chain timestamps and preserve their source.
Derived portfolio totals may exceed an individual uint256 field; use unconstrained
exact numeric aggregation (or a deliberately wider derived type), not a uint256
cap or floating-point conversion on a sum across properties.
Index property search/location/status, holding address/property, canonical event
wallet/deployment/block order, and published metadata lookup.

## 5. Chain ingestion and consistency

1. Load a reviewed deployment and start at its actual receipt block.
2. Confirm RPC chain ID before every worker startup; use a read-only credential.
3. Acquire a per-deployment lease. Read the configured block range and logs with
   provider-aware batch sizes, backoff, retry limits and rate control.
4. Verify block ancestry against the cursor. Insert raw blocks/events idempotently.
5. Project `PropertyCreated`, `TokensPurchased`, `TokensTransferred`,
   `PropertyStatusChanged`, and `FundsWithdrawn` in deterministic block/log order.
6. Commit raw canonical events, projection updates, and the cursor in one DB transaction.
7. Reconcile periodic `getProperty`, `getTokenBalance`, and contract-balance reads
   at the same block reference. Report divergence; do not silently rewrite history.
8. Serve API responses with an explicit projection watermark and finality policy.

Projection rules must match the contract: creation sets available supply but
does not credit the owner; purchases reduce available supply and credit buyers;
transfers move holder balances without changing available supply; self-transfers
have zero net effect; status/withdrawal events do not alter holder balances.
Check `available + sum(holder balances) = total` for each property. Treasury
balance is not an investor entitlement or an income-distribution ledger.

For a reorg, find the last common ancestor within retained history, mark orphaned
blocks/events noncanonical, and rebuild affected projections from a trusted
checkpoint or replay. Perform rollback/replay transactionally. A duplicate log,
restart, self-transfer, or re-included transaction must never double-credit tokens.
Stop and mark the deployment degraded if the reorg exceeds retained ancestry;
require deliberate resynchronization rather than serving inconsistent holdings.

Do not equate an L2 receipt with every notion of settlement/finality. Prefer
provider-supported safe/finalized heads where available and document any fallback
confirmation-depth policy. Return the indexed block/hash, head/lag and status in
API metadata. Phase 1's browser receipt-confirmed UI is unchanged; the future
indexer must label its own potentially lagging/finality-filtered view explicitly.

## 6. Proposed API boundary

Phase 2A implements `/health/live`, `/health/ready`, `/api/v1/networks`,
`/api/v1/properties` and `/api/v1/properties/:id` (internal UUID), with validation
and real PostgreSQL tests. Queries separate off-chain metadata from unverified
stored snapshots; no synchronization exists yet. The frontend does not consume
these routes. See [API.md](API.md) for their exact current contract.

The broader routes below remain the **future** proposal; the eventual version
prefix will align with `/api/v1`. Deployment-scoped and authentication routes are
not implemented by Phase 2A.

| Method/path                                                            | Access                                | Responsibility                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /networks`                                                        | Public                                | Public chain parameters and deployment IDs; never privileged RPC secrets            |
| `GET /deployments/:deploymentId`                                       | Public                                | Reviewed contract identity and indexer status                                       |
| `GET /deployments/:deploymentId/properties`                            | Public                                | Paginated search/location/status and published metadata                             |
| `GET /deployments/:deploymentId/properties/:onChainId`                 | Public                                | Chain-derived facts, published assets, source watermark                             |
| `GET /deployments/:deploymentId/wallets/:address/holdings`             | Public chain data                     | Current indexed balances and clearly labeled reference allocation                   |
| `GET /deployments/:deploymentId/wallets/:address/activity`             | Public chain data                     | Canonical purchases/transfers with opaque pagination cursor                         |
| `GET /deployments/:deploymentId/transactions/:hash`                    | Public                                | Independently observed receipt/indexing status; no financial mutation               |
| `POST /auth/challenges`                                                | Rate-limited public                   | Issue a short-lived SIWE challenge                                                  |
| `POST /auth/sessions`                                                  | Signed challenge                      | Verify proof, atomically consume nonce, establish session                           |
| `GET /auth/session`                                                    | Authenticated                         | Minimal session/profile details                                                     |
| `DELETE /auth/session`                                                 | Authenticated                         | Revoke session and clear cookie                                                     |
| `POST /admin/deployments/:deploymentId/properties/:onChainId/metadata` | Scoped content operator               | Create metadata draft/version for an existing on-chain property                     |
| `PUT /admin/metadata/:versionId`                                       | Scoped content operator               | Edit a draft with optimistic version checks                                         |
| `POST /admin/metadata/:versionId/publish`                              | Authorized publisher                  | Validate and publish off-chain metadata; audit change                               |
| `POST /admin/assets/upload-intents`                                    | Scoped content operator               | Issue restricted public-asset upload intent; validate completion before publication |
| `GET /health/live`, `GET /health/ready`                                | Minimal public / detailed private ops | Process, DB and indexer readiness without secrets                                   |

There are deliberately **no custodial buy, transfer, mint, status-change, or
withdrawal endpoints**. Those contract writes remain in the browser wallet. A
backend cannot take a client's claimed balance or receipt as authorization.
Do not expose the deployer's signing key to an API or indexer process.

Set maximum page sizes and query lengths; use allowlisted sort fields and typed
validation. Use opaque activity cursors scoped to deployment and canonical
block/log order. Reject expired/noncanonical cursors after reorg with a documented
restart response. Consistent responses include:

```json
{
  "data": [],
  "meta": {
    "deploymentId": "uuid",
    "chainId": 84532,
    "indexedBlock": "123456",
    "indexedBlockHash": "0x...",
    "finalityPolicy": "configured-policy-name",
    "nextCursor": null
  }
}
```

Financial amounts and identifiers within `data` are decimal strings. Reference
values include unit/basis labels, not invented fiat prices, P&L, yields, or redemption promises.
Public holdings endpoints reveal only already-public chain data, not user profiles
or verified wallet-to-person associations.

## 7. Wallet authentication and authorization

Use [ERC-4361 Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
for off-chain sessions. Bind the signature to an allowed domain, URI, chain,
nonce, issuance/expiry time, and requested wallet. Consume the challenge atomically
to prevent replay. For contract wallets, add explicit chain-aware ERC-1271
verification in the authentication phase or reject unsupported account types clearly.

Use secure HttpOnly cookies and a same-site API origin where practical. Apply
origin/CSRF protections to mutations, exact CORS allowlists, session expiry and
revocation, rate limits, and audit logging. A browser's connected wallet is not
an authenticated backend session by itself. An account/network change must clear
or revalidate the corresponding off-chain session as well as the existing signer context.

Separate content-editor roles from contract ownership. For owner-scoped metadata
actions, verify the current owner against the correct deployment, not a global
frontend flag or a user-supplied address. Granting an off-chain role cannot alter
the contract's `onlyOwner` checks. Do not call wallet control proof KYC, beneficial
ownership verification, or proof of property title.

## 8. Asset and infrastructure boundaries

- Store public media/documents in object storage behind a CDN. PostgreSQL stores
  references, checksums and publication/version state, not large file bodies.
- Scope upload intents by content type, size, expiry and storage key; inspect
  completed files before publishing. Sanitize metadata and enforce allowed URL
  schemes/storage hosts. Do not fetch arbitrary user-supplied URLs server-side.
- Exclude private identity/investor documents from this public metadata workflow.
- Keep DB credentials, session secrets, storage credentials, and privileged RPCs
  in the backend host's secret manager. No `VITE_` secrets, signing keys, or committed `.env` files.
- Use TLS, least-privilege DB users, explicit migrations, encrypted backups,
  tested restoration, request IDs, redacted logs, and indexing-lag metrics.
- Preserve versioned releases tying contract artifact, public manifest, indexer
  decoder, schema migrations, and frontend together.

## 9. Incremental backend delivery proposal

1. Bootstrap NestJS modules, validation, health endpoints, migrations and PostgreSQL
   integration; no chain writes or new financial rules.
2. Add reviewed network/deployment registries and idempotent event ingestion for
   the current ABI. Test replay, restarts, self-transfers, reorgs and reconciliation.
3. Expose read-only property/portfolio/activity APIs with explicit watermarks.
   Introduce the API behind a frontend feature flag while keeping RPC-based verification.
4. Add SIWE sessions, scoped content roles and audited/versioned property metadata.
5. Add controlled media upload/publication and operational monitoring.

Before changing financial capabilities, separately specify legal/operational
rights and the necessary contract lifecycle. Escrow, refunds, distributions,
marketplace resale, stablecoin payments, mainnet deployment, and real investor
funds are outside Phase 1 and outside this backend's initial read-model scope.

## 10. Acceptance criteria for the future backend

- A full replay produces the same projections as uninterrupted indexing.
- Duplicate delivery and self-transfer cannot double-credit holdings.
- Reorg rollback/replay restores the supply invariant and invalidates stale cursors.
- All balances/wei retain exact precision across DB, API serialization and React.
- Metadata APIs cannot mutate chain-derived financial fields.
- Signature replay, wrong domain/chain, expired nonce and unauthorized publication are rejected.
- Public endpoints never expose signing keys, private RPC credentials, profile associations or private assets.
- API degradation does not enable an unauthorized transaction or silently replace live data with samples.
- The original contract tests and wallet-based flows continue to pass.

See [deployment instructions](DEPLOYMENT.md) for what is available now and
[Phase 1 delivery notes](PHASE_1.md) for verification and remaining manual steps.
