# Phase 1 — Localhost, Base Sepolia, and public demo deployment

## Scope

The existing Solidity 0.8.19 contract and its financial behavior are unchanged.
This guide covers deployment tooling and a static React demo. It does not deploy
a backend, deploy to mainnet, or turn token balances into legal property ownership.
No Base Sepolia contract is pre-populated in this repository.

The supported network registry is [config/networks.json](../config/networks.json).

| Target        | Chain ID | Default RPC                | Explorer                       |
| ------------- | -------- | -------------------------- | ------------------------------ |
| `localhost`   | 31337    | `http://127.0.0.1:8545`    | None                           |
| `baseSepolia` | 84532    | `https://sepolia.base.org` | `https://sepolia.basescan.org` |

Base's official [network settings](https://docs.base.org/get-started/connect-to-base)
identify Base Sepolia as a test network using ETH for gas. Use **Base Sepolia test
ETH only**. Ethereum Sepolia and Base Sepolia have different balances/networks.

## 1. Install and verify

Use the supported Node 22 version from `.nvmrc`. From the repository root:

```powershell
npm run setup
npm run compile
npm test
npm run test:config
npm run test:frontend
npm run build
```

Optional local end-to-end verification after both dependency sets are installed:
`npm run test:integration`. It reserves port 18545 for an isolated chain, exercises
deployment/purchase/transfer/withdrawal, checks missing-secret guards and testnet
build isolation, then restores the original local deployment metadata and default
build. It sends no public-network transactions and refuses an occupied test port.

The ABI stays committed. Compilation does not select a deployment or access a
private key. The gas reporter is opt-in with `REPORT_GAS=true`.

## 2. Preserve the local workflow

No credentials are required. Use separate root terminals:

```powershell
# Terminal 1: keep running
npm run node
```

```powershell
# Terminal 2
npm run deploy:local
```

```powershell
# Terminal 3
npm run dev
```

The local script writes the ignored
`react-frontend/src/generated/deployment.json`. Its chain ID, block, and address
are used only when `VITE_NETWORK=localhost` (the default outside testnet mode).
Restart Vite after first deployment. A node reset requires redeployment and new listings.

For a custom local port, the deployment process supports `LOCALHOST_RPC_URL`;
set the matching public `VITE_RPC_URL` for the frontend. The chain must remain 31337.

## 3. Configure private deployment tooling

Create a root `.env` from `.env.example` **only if you do not already have one**:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Fill it privately in your editor:

| Variable               | Use                                                | Secret?                          |
| ---------------------- | -------------------------------------------------- | -------------------------------- |
| `DEPLOYER_PRIVATE_KEY` | Dedicated Base Sepolia signing wallet, 0x-prefixed | Yes                              |
| `BASE_SEPOLIA_RPC_URL` | Node-side HTTPS RPC; optional override             | May contain provider credentials |
| `ETHERSCAN_API_KEY`    | Etherscan V2 source-verification key               | Yes                              |
| `LOCALHOST_RPC_URL`    | Optional local-only RPC override                   | Normally not                     |

The root `.env` is loaded with Node's built-in environment loader; an existing
process variable takes precedence. Missing private keys do not prevent local
tests/builds. The Base Sepolia deploy command requires a configured signing key.
Use a new test-only wallet; never use the publicly known Hardhat keys on a public
network, a mainnet treasury wallet, or a wallet holding real investor funds.

Do not paste secrets into commands, chat, source files, public deployment records,
or frontend hosting settings. The scripts do not log signing keys and redact
configured deployment secrets in reported errors. External RPC/tooling may have
its own logs; avoid publishing verbose debug output without reviewing it.

`.env`, `.env.*`, key files, and secret/keystore directories are ignored. Only
the explicitly named example templates are allowed. Verify exclusion before committing:

```powershell
git check-ignore .env react-frontend/.env.local react-frontend/.env.testnet.local
git status --short
```

Git ignore rules do not remove a file already tracked. If a credential was ever
committed, rotate/revoke it; deleting its latest copy is insufficient.

## 4. Deploy once to Base Sepolia

Fund the dedicated wallet with Base Sepolia test ETH from an appropriate testnet
faucet. Confirm the network in the wallet and RPC configuration first.

```powershell
npm run deploy:base-sepolia
```

Before sending a transaction, the script checks the allowed network, configured
signer, actual RPC chain ID, and nonzero test balance. Hardhat also pins the network
chain ID. Only localhost and Base Sepolia are supported by this deployment script.

After a confirmed deployment it:

1. Synchronizes the existing frontend ABI from the artifact.
2. Writes `deployments/baseSepolia.json` with public address, chain ID, block,
   transaction hash, deployer address, compiler version, and bytecode hash.
3. Prints the contract's explorer URL.

It does **not** replace the localhost deployment file. The deployer becomes the
contract owner exactly as before. No seed properties are created automatically.
Review the public manifest and commit it with the exact contract/compiler source
used for the release; never add RPC URLs or credentials to it.

If a transaction succeeded but file writing failed, recover its receipt/address
from the explorer rather than blindly deploying another instance. A fresh deploy
creates a separate empty contract and does not migrate balances or properties.

## 5. Verify the deployed source

The installed Hardhat 2 verification plugin uses Etherscan V2 when its API key
configuration is a string. This project explicitly declares the existing
`@nomicfoundation/hardhat-verify` 2.1.x dependency and retains Hardhat 2.
See [Hardhat 2 verification documentation](https://v2.hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify).

Set an Etherscan V2 API key with access to the selected chain, then run:

```powershell
npm run verify:base-sepolia
```

The wrapper reads the public manifest, confirms chain identity and matching
on-chain/local bytecode, then verifies the fully qualified contract with **no
constructor arguments**. Verification can run without the deployer key.
It never redeploys. If the explorer has not indexed the deployment yet, wait and
retry verification against the same address. Check provider API access/rate limits
if the service rejects the request.

Open the printed BaseScan `#code` URL to inspect verified source. Explorer
verification is source/bytecode publication, not a security audit or verification
of property titles. Changing the source or compiler settings can prevent matching
an earlier deployment; keep the release checkout available.

## 6. Configure the frontend for testnet

The frontend accepts only public, build-time configuration:

| Variable                | Meaning                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `VITE_NETWORK`          | `localhost` or `baseSepolia`                                         |
| `VITE_RPC_URL`          | Browser-readable RPC; HTTPS required for Base Sepolia                |
| `VITE_CONTRACT_ADDRESS` | Optional override for the selected network's record                  |
| `VITE_DEPLOYMENT_BLOCK` | Exact deployment receipt block; required with a new address override |

For Base Sepolia, commit the reviewed manifest **or** supply the real address and
deployment block together. The client never reuses localhost metadata for testnet.
An explicit address override may use a matching manifest's block; a different
address requires its own block. Base Sepolia configuration rejects block zero to
avoid scanning event history from genesis. Local historical record block zero remains supported.

For local testnet preview:

```powershell
if (-not (Test-Path react-frontend/.env.testnet.local)) {
  Copy-Item react-frontend/.env.testnet.example react-frontend/.env.testnet.local
}
# Fill the public deployment values privately in your editor if no manifest is committed.
npm run dev:testnet
```

Vite's testnet mode selects Base Sepolia by default. Do not keep
`VITE_NETWORK=localhost` or a localhost RPC in `.env.local` when invoking testnet
mode; remove the conflicting values or override them in `.env.testnet.local`.
Process variables override env-file values. Restart Vite after configuration changes.

`npm run build` retains the original local/sample-friendly build. Hosted demos
must use `npm run build:testnet` (or explicitly set `VITE_NETWORK=baseSepolia`).
A missing/invalid testnet address, block, or RPC makes the build fail before upload.
Build validation checks configuration, not whether an address has deployed code;
the read-only client verifies network/code at runtime.

**Every `VITE_*` value is public in the browser.** Do not prefix signing keys,
mnemonics, or explorer secrets with `VITE_`. The build rejects common secret
variable names as a guard, but that is not a substitute for reviewing all build
variables. A browser RPC endpoint must be intended for public client use; apply
provider origin restrictions and quotas where available. Keep privileged RPC
credentials exclusively in deployment/backend environments.

## 7. Publish a static testnet demo

Use a static host with HTTPS and keep its checkout rooted at the repository:

- **Node:** supported Node 22.
- **Install command:** `npm ci --prefix react-frontend`.
- **Build command:** `npm run build:testnet`.
- **Output directory:** `react-frontend/dist`.
- **Environment:** public `VITE_NETWORK=baseSepolia`, browser-safe RPC, and the
  deployed address/block if the manifest is not committed.
- **No deployment secrets** are needed on the static host.

Host at the site's domain root; the current public asset paths assume `/`.
Hash routes support page refresh and browser back/forward without server rewrites.
The backend is not required for Phase 1. Configuration is embedded during build;
changing a host variable requires a rebuild and redeployment of the frontend.
Do not expose the ignored root `.env`, node_modules, artifacts, or source tree as
the hosting output. Publish only the built directory.

The public default RPC is useful for testing but does not provide a production
availability guarantee. For a shared demo, select a browser-compatible provider
supporting CORS, event-log reads and the existing 2,000-block log batches; test its
quotas with expected traffic. An optional future indexer reduces these reads.

## 8. Manual hosted-demo acceptance

1. Confirm the published network label is Base Sepolia and no request points to localhost.
2. Browse properties without a wallet. If the deployed contract is empty, the UI must say so.
3. Confirm fictional samples remain explicitly labeled and cannot transact.
4. Connect a dedicated test wallet. Exercise wrong-network switching and unknown-network addition.
5. With the actual deployment owner, create a test listing using test ETH for gas.
6. With another test wallet, review gas/payment, reject one request, then buy tokens.
7. Inspect the confirmed receipt and explorer link, portfolio, transfer, and history.
8. Switch accounts/networks and confirm old wallet context is cleared.
9. Exercise activation/deactivation and treasury withdrawal only with test funds.
10. Confirm supporting images/documents and all demo/ownership/reference-value labels are accurate.

Public deployment, explorer verification, hosting, and this real-wallet acceptance
pass are manual configuration/release steps, not automatic effects of running CI.

## 9. Continuous integration

`.github/workflows/ci.yml` runs on pushes, pull requests, and manual dispatch:

- Contract/deployment configuration tests, compilation, contract tests, ABI freshness.
- Frontend tests, the ordinary build, and a testnet-mode build using explicitly
  synthetic **configuration-only** values. That fixture is not deployed, uploaded,
  or presented as a real contract.

Jobs use lockfiles, npm caching, Node from `.nvmrc`, read-only repository permissions,
and no deployment secrets. There is no automatic chain deployment, verification,
hosting publication, or production database migration. Enable Actions in the
repository and select both jobs as required PR checks once their first run passes.

## Configuration and trust boundaries

| Location                                   | Allowed data                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Root `.env` / protected deployment process | Signing key, privileged RPC, explorer API key                          |
| `config/networks.json`                     | Public chain parameters only                                           |
| `deployments/baseSepolia.json`             | Reviewed public transaction/deployment facts only                      |
| Frontend env / static host                 | Public chain selection, address, block, browser-safe RPC               |
| GitHub CI                                  | No signing/explorer credentials; no funded accounts                    |
| Future backend environment                 | Database/session/storage/provider secrets, never investor signing keys |

See [the backend design](ARCHITECTURE.md) for the proposed hybrid Phase 2 boundary.
