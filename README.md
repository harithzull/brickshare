# BrickShare

A local real estate tokenization demo built with Solidity, Hardhat, React, Vite,
and ethers.js. An administrator lists properties, investors purchase fractional
tokens with test ETH, and holders transfer tokens between wallets.

This is a development demo. Token balances are application records; they do not
establish legal ownership of a property. There is no rental income distribution,
refund system, or secondary marketplace in this version.

## How it works

```text
React frontend -> ethers.js -> MetaMask -> Hardhat blockchain -> Solidity contract
```

There is no separate backend or database. The contract stores listings, token
balances, and purchase funds. The deployment wallet is the administrator.

The marketplace can read live listings through a read-only RPC without MetaMask.
Search by name/location and filter by location or availability, then open a
property for supply, price, documents and a purchase summary. Connect a wallet
for holdings, ownership percentages, purchase/transfer history and administration.
Write actions show a payment and gas estimate before opening the wallet.

An explicitly selected **Sample preview** contains fictional properties and
illustrations; it cannot transact. Live network failures never substitute sample
data. Additional photographs, descriptions and documents can be configured using
the [property metadata guide](react-frontend/PROPERTY_METADATA.md).

- The administrator adds a property with a fixed supply and a price per token.
- Investors buy tokens by sending exactly quantity times token price in ETH.
- Holders can transfer their tokens to another address.
- The administrator can withdraw all collected purchase funds.
- The contract supports enabling/disabling purchases for a property; the React
  interface displays this status but does not yet provide a status editor.

Token balances use custom mappings, not ERC-20 or ERC-1155. Deactivating a listing
does not disable transfers. Each state-changing transaction requires gas.

## Requirements

- Node.js 22.19.0 or a newer Node 22 release, with npm. The version files pin
  22.19.0 as the reproducible development baseline.
- A browser with MetaMask to interact with the demo.
- Internet access on first setup for npm packages and the Solidity compiler.

Run all commands below from the repository root unless a section says otherwise.

## Install

```sh
npm run setup
npm run compile
```

Setup installs the root and React dependencies using their committed lockfiles
(`npm ci`). Compilation also synchronizes the frontend ABI with the compiled
contract. No environment variables or private keys are needed for the local demo.

## Run locally

Use three terminals, each opened in the repository root.

### Terminal 1: blockchain

```sh
npm run node
```

Keep it running. Hardhat prints funded test accounts and their private keys.
Its RPC URL is `http://127.0.0.1:8545` and chain ID is `31337`.

### Terminal 2: deployment

```sh
npm run deploy:local
```

This deploys `RealEstateTokenization` and automatically writes:

- `react-frontend/src/generated/RealEstateTokenization.abi.json`: contract ABI.
- `react-frontend/src/generated/deployment.json`: address, chain ID, transaction hash.

The ABI belongs in source control. The local deployment file is ignored because
another developer has their own blockchain. Do not edit generated files manually.

### Terminal 3: frontend

```sh
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

### Connect MetaMask

Add/select a custom network with these values:

| Setting         | Value                   |
| --------------- | ----------------------- |
| Name            | Hardhat Local           |
| RPC URL         | `http://127.0.0.1:8545` |
| Chain ID        | `31337`                 |
| Currency symbol | `ETH`                   |

Import Account #0 from the running Hardhat node to act as the administrator.
Import Account #1 to act as an investor. These publicly known development keys
must only be used with test funds. Connect the selected account through the app.

### Try the demo

1. As Account #0, add "Cyberjaya Condo", location "Cyberjaya", supply `1000`,
   price `0.01` ETH per token. Confirm the transaction in MetaMask.
2. Switch to Account #1, reconnect after the page reloads, and buy `10` tokens of
   property ID `1`. The purchase costs `0.1` test ETH plus gas.
3. Transfer `3` tokens to a different Hardhat account.
4. Switch back to Account #0 and withdraw the collected purchase funds.

Restarting the Hardhat node clears its in-memory state. Deploy again, restart
the frontend so Vite picks up the generated deployment file, and recreate the
listings. The deployment address may repeat on a fresh chain; the old data does not.

## Development commands

| Command                 | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `npm run setup`         | Install both packages from lockfiles                         |
| `npm run compile`       | Compile Solidity and regenerate the frontend ABI             |
| `npm test`              | Run the real estate contract suite on a temporary test chain |
| `npm run test:frontend` | Check purchase math, filters, public reads and event history |
| `npm run node`          | Run the persistent-for-the-session local blockchain          |
| `npm run deploy:local`  | Deploy to localhost and update frontend configuration        |
| `npm run dev`           | Start the React development server                           |
| `npm run build`         | Build the React frontend into `react-frontend/dist/`         |
| `npm run preview`       | Preview the existing frontend production build               |

After a Solidity change, compile, test, and redeploy before using the frontend.
Builds work without a local deployment, but wallet actions require deployment.
For a production-build demo, deploy before building; deployment metadata is
embedded in the frontend bundle at build time.

The backend tooling uses ethers v6 through Hardhat, while the React application
uses ethers v5. Keep dependencies in their respective packages.

The default read-only RPC is `http://127.0.0.1:8545`. Override it with
`VITE_RPC_URL` in `react-frontend/.env.local` (see `.env.example`) if needed.
Vite variables are public browser configuration; do not put private credentials
in them. A hosted demo needs a browser-accessible HTTPS RPC for its deployed
network; localhost refers to each visitor's own machine.

The optional Ignition module is `ignition/modules/RealEstateTokenization.js`.
It retains the existing module ID for compatibility with earlier journals.
The documented `deploy:local` script is the supported frontend workflow; a direct
Ignition deployment does not synchronize frontend configuration.

## Repository layout

```text
contracts/                 Solidity contract
scripts/                   Deployment and frontend configuration generation
test/                      Active real estate contract tests
ignition/modules/          Optional Ignition deployment module
react-frontend/            Main React + Vite application
  src/generated/           Generated ABI and local deployment metadata
archive/                   Historical HTML frontends and unused sample test
```

Commit both `package-lock.json` files and the generated ABI. Dependency folders,
build output, Hardhat artifacts/cache, and local deployment state are ignored.
After intentionally changing dependencies, update the relevant lockfile with
`npm install` in that package.

## Troubleshooting

- **Contract not deployed:** start the node, run `npm run deploy:local`, then
  restart the frontend. No address copying is needed.
- **Wrong network or connection failure:** select chain `31337` in MetaMask,
  confirm the node is running, and redeploy if the node was restarted.
- **Owner buttons disabled:** connect the wallet that deployed the contract
  (Account #0 in the default workflow).
- **Balances or listings look stale:** use Refresh; account/network changes reload
  the page and may require reconnecting.
- **Nonce errors after resetting the local chain:** clear MetaMask's activity/nonce
  data for the development account and reconnect to the local network.
- **Port in use:** use Vite's printed URL. The local blockchain must be available
  on port `8545` for the default deployment command.

The archived implementations are historical references and are not part of the
supported setup or active test suite. See [archive/README.md](archive/README.md).
