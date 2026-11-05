# BrickShare 2.0 — Phase 1 delivery

This is the historical Phase 1 record. The subsequent optional backend foundation
is documented in [Phase 2A](PHASE_2A.md) and [API setup](API.md).

## Implemented scope

The existing React application, Solidity contract, and wallet-based financial
flows are retained. Phase 1 adds a second deployment target, environment-specific
public configuration, verification tooling, CI, and a backend technical design.
The Solidity source, ABI, token accounting, purchase payment rules, and owner
permissions have no diff. No NestJS service or PostgreSQL schema is implemented.

The initial repository used one generated deployment record and local-only
wallet-network addition. The new configuration makes network selection explicit
and keeps localhost and Base Sepolia records separate. No public chain deployment,
explorer verification, website publication, Git commit, or push was performed.

## Reviewable change groups

### 1. Network configuration and Node-side secrets

- Added `config/networks.json`: shared public localhost/Base Sepolia parameters.
- Added `config/deployment.js`: optional root env loading, private signing-key/RPC
  validation, supported-network guards, public manifest validation, error redaction.
- Added root `.env.example`; extended `.gitignore` for testnet examples and key/secret files.
- Updated `hardhat.config.js`: Base Sepolia 84532, unchanged local 31337 defaults,
  optional custom localhost RPC, Etherscan V2, opt-in gas reporting.
- Updated `package.json` and root lockfile: deployment/verification/configuration
  commands and an explicit declaration of the already-installed verification plugin.

No root env file or live credential was created. Node's env loader avoids adding
a dotenv dependency and respects the supported Node 22 baseline.

### 2. Deployment records and verification

- Updated `scripts/deploy.js`: allowed/actual chain checks, missing-key and balance
  preflight, public record writing only after a receipt, and redacted failures.
- Added `scripts/verify.js`: recorded address/chain/bytecode checks and Etherscan V2
  verification with no constructor arguments; no automatic redeployment.
- Added `deployments/README.md`: public-manifest policy. An actual
  `deployments/baseSepolia.json` will be generated only when a maintainer deploys.
- Local deployment still writes ignored `react-frontend/src/generated/deployment.json`.

### 3. Public frontend preparation

- Added `react-frontend/src/lib/chain-config.js`: selected-network resolution,
  address/block/RPC validation and wallet add/switch flow.
- Updated `react-frontend/src/config.js`: public shared registry and network-scoped
  records; no fallback from Base Sepolia to a local deployment.
- Updated `react-frontend/vite.config.js`: fail invalid/incomplete public testnet
  configuration before building, rather than after publication.
- Updated frontend/root package scripts with `dev:testnet` and `build:testnet`.
- Updated frontend `.env.example`; added `.env.testnet.example` with public values only.
- Updated `useBrickShare.js` for the selected wallet network, including explicitly
  switching after unknown-network addition and preserving wallet-context protections.
- Updated `useMarketplace.js` with correct local/testnet recovery messages.
- Updated `TransactionStatus.jsx` with the selected testnet explorer link.

All existing rendering, sample/live isolation, precise calculations, transaction
review, receipt confirmation, transfers, administration and event reads remain.
Privileged deployment credentials are neither needed nor imported by a frontend build.

### 4. CI and tests

- Added `.github/workflows/ci.yml`: separate contract/configuration and frontend
  jobs on push, PR and manual dispatch; Node/lockfile caching and read-only permissions.
- Added `scripts/tests/deployment.test.cjs`: signing/RPC validation, chain guards,
  manifest identity and secret-redaction tests.
- Added `react-frontend/test/chain-config.test.mjs`: environment isolation, missing
  configuration, wallet onboarding/rejection and client-secret guard tests.
- Added `scripts/tests/local-deployment-smoke.cjs`, exposed as
  `npm run test:integration`, for repeatable isolated local deployment/build checks.

CI runs the requested contract tests, frontend tests and ordinary build, plus
configuration checks, ABI freshness and a testnet-mode build with a clearly
synthetic configuration-only fixture. It has no signing/explorer secrets and no
automatic deployment, publication, verification, or migration task. The optional
integration command requires both dependency sets and is not run by the two CI jobs.

### 5. Documentation and proposed backend

- Added [DEPLOYMENT.md](DEPLOYMENT.md): local/testnet setup, secret boundaries,
  source verification, static-host configuration, CI and manual release acceptance.
- Added [ARCHITECTURE.md](ARCHITECTURE.md): proposed NestJS modules, PostgreSQL
  entities/constraints, exact numeric representation, API routes, SIWE sessions,
  asset boundaries, idempotent indexing, finality provenance and reorg recovery.
- Updated root/frontend READMEs and `USE_CASES.md` for the implemented workflows.

The backend proposal keeps price/supply/holdings authoritative on-chain. Its APIs
will provide metadata and read models, never custodial buy/transfer/withdrawal
endpoints or investor signing-key storage. No backend dependency, service, DB
container, migration, authentication flow or endpoint was added in Phase 1.

## Local verification results

| Check                               | Result                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Compile and ABI synchronization     | Passed; committed ABI has no diff                                                                                     |
| Contract suite                      | 19 passed                                                                                                             |
| Frontend suite                      | 16 passed (nine existing + seven chain/wallet tests)                                                                  |
| Deployment configuration suite      | Five passed                                                                                                           |
| Default production build            | Passed                                                                                                                |
| Testnet-mode production build       | Passed with explicitly synthetic public configuration; no live contract claimed                                       |
| Missing testnet configuration       | Correctly rejected before building                                                                                    |
| Missing deployment/explorer secrets | Correctly rejected before RPC contact in integration checks                                                           |
| Local integration                   | Actual localhost deployment, manifest/hash/owner, purchases, transfer and withdrawal passed                           |
| Network-record separation           | Local deployment left Base Sepolia manifest unchanged                                                                 |
| Browser output secret isolation     | Synthetic unprefixed private process canaries absent from built JS/HTML/CSS/JSON                                      |
| Workflow                            | YAML structure and root lockfile dependencies validated locally; hosted Actions run still pending push                |
| Git exclusion                       | Root env, frontend local env and secret/key paths are ignored; only named example templates are intended for tracking |

The integration test uses a fresh local chain on port 18545, refuses an occupied
port, and restores the prior local deployment metadata and default build. Its
test accounts have only local test funds. The temporary node was stopped after
the completed run. No new visual-browser or manual MetaMask-extension test is
claimed for this configuration phase.

## Remaining manual configuration

1. Install from the updated lockfiles with `npm run setup` after pulling the changes.
2. Create root `.env` from its example if needed and configure a dedicated testnet
   signing wallet and HTTPS RPC. Obtain Base Sepolia test ETH for that wallet.
3. Run `npm run deploy:base-sepolia`; review the generated public manifest.
4. Set a compatible Etherscan V2 key and run `npm run verify:base-sepolia`.
   Successful explorer verification has not been performed during this task.
5. Commit the reviewed public deployment record, or configure the real public
   contract address and deployment block in the frontend build environment.
6. Configure public `VITE_NETWORK=baseSepolia` and a browser-safe HTTPS RPC. Use
   `npm run build:testnet` and publish only `react-frontend/dist` to an HTTPS host.
7. Follow the hosted-demo acceptance checklist with actual test wallets. Verify
   the selected chain, owner account, RPC quotas/CORS, logs, source page and explorer links.
8. Push this branch, enable Actions if needed, and configure required PR checks
   after the first hosted workflow run succeeds.

Do not provide private keys or explorer credentials to the frontend host, browser,
Git repository, or CI test jobs. No real investor funds or mainnet network is part
of this phase.
