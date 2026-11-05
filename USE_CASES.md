# BrickShare — Project Use Cases

This document describes the current BrickShare real estate tokenization demo.
It covers the React application, Solidity contract, and local developer workflow.
It can be used as a project specification, demonstration guide, or acceptance checklist.

Phase 2A also provides an optional, independent read-only metadata API. Developers
can check process/database readiness, list configured networks, query published
property metadata and run guarded fictional fixtures. Phase 2B.1 adds a separate
local read-only indexer with verified deployment import, property reconciliation,
restart/reorg/reset handling and freshness; see [indexer guide](docs/INDEXER.md).
Phase 2B.2 joins published API metadata to RPC listings with deployment/instance
checks, freshness labels and independent fallback; see [full-stack guide](docs/PHASE_2B_2.md).
Authenticated Studio actions remain future; the existing React use cases below
continue through RPC and wallet. See [API reference](docs/API.md) and
[Phase 2A scope](docs/PHASE_2A.md).

## 1. Scope and implementation status

BrickShare lets visitors browse property listings, connect a wallet, purchase
fractional tokens using test ETH, view holdings, and transfer tokens. The contract
administrator creates listings and withdraws collected funds.

**Status labels:**

- **Application:** implemented in the main React application.
- **Contract only:** implemented in Solidity but has no dedicated React control.
- **Developer workflow:** performed through project commands or source configuration.
- **Future:** proposed capability that is not implemented.

This is a development demo. A token is a balance recorded by this application;
it does not establish legal ownership of real estate. The current implementation
does not verify property titles or provide refunds, rental income, or resale services.

## 2. Actors

| Actor                          | Responsibility and access                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Visitor                        | Browses live listings and fictional samples without connecting a wallet.                                                  |
| Investor / token holder        | Connects a wallet, buys tokens, views their portfolio, and transfers tokens they own.                                     |
| Administrator / contract owner | The deployment wallet; creates listings, changes their purchase status, and withdraws funds. Can also act as an investor. |
| Recipient                      | Receives tokens at a nonzero address. Does not need to connect to the website before receiving them.                      |
| Developer / maintainer         | Installs dependencies, runs the local chain, deploys the contract, publishes presentation metadata, and verifies changes. |
| Browser wallet                 | Supplies the selected account and network, requests signing approval, and submits transactions.                           |
| Blockchain / RPC               | Serves contract data and event logs, validates transactions, records balances, and returns receipts.                      |

There is no username/password registration, server account, or administrator
login separate from wallet ownership. Hiding or disabling a button is not the
permission boundary: the Solidity contract enforces restricted operations.

## 3. Use-case index

| ID    | Use case                                          | Primary actor            | Status             |
| ----- | ------------------------------------------------- | ------------------------ | ------------------ |
| UC-01 | Browse live property listings                     | Visitor                  | Application        |
| UC-02 | Search and filter listings                        | Visitor                  | Application        |
| UC-03 | View property details                             | Visitor                  | Application        |
| UC-04 | View supporting documents                         | Visitor                  | Application        |
| UC-05 | Explore the fictional sample catalog              | Visitor                  | Application        |
| UC-06 | Connect a wallet                                  | Investor / administrator | Application        |
| UC-07 | Switch to the expected network                    | Wallet user              | Application        |
| UC-08 | Disconnect or change wallet context               | Wallet user              | Application        |
| UC-09 | Review and confirm a transaction                  | Wallet user              | Application        |
| UC-10 | Purchase property tokens                          | Investor / administrator | Application        |
| UC-11 | View holdings and ownership percentages           | Token holder             | Application        |
| UC-12 | View purchase and transfer history                | Wallet user              | Application        |
| UC-13 | Transfer property tokens                          | Token holder             | Application        |
| UC-14 | Access the administrator workspace                | Administrator            | Application        |
| UC-15 | Create a property listing                         | Administrator            | Application        |
| UC-16 | View collected funds                              | Administrator            | Application        |
| UC-17 | Withdraw collected funds                          | Administrator            | Application        |
| UC-18 | Activate or deactivate purchases                  | Administrator            | Application        |
| UC-19 | Refresh data and recover from connection failures | Visitor / wallet user    | Application        |
| UC-20 | Supply descriptions, photographs, and documents   | Maintainer               | Developer workflow |
| UC-21 | Set up and deploy the local demo                  | Developer                | Developer workflow |
| UC-22 | Verify and build the project                      | Developer                | Developer workflow |
| UC-23 | Deploy the existing contract to Base Sepolia      | Developer                | Developer workflow |
| UC-24 | Verify deployed contract source                   | Developer                | Developer workflow |
| UC-25 | Build and publish a public testnet demo           | Maintainer               | Developer workflow |
| UC-26 | Run automated repository checks                   | Contributor              | Developer workflow |

## 4. Public browsing use cases

### UC-01 — Browse live property listings

**Actor:** Visitor. **Trigger:** Open Marketplace with Live listings selected.

**Preconditions:** A deployment is configured and its read-only RPC is reachable.
Neither MetaMask nor a connected wallet is required.

**Main flow:**

1. The application connects to the read-only RPC and verifies the expected network and contract code.
2. It reads the property count and the details of each listing.
3. It displays the name, location, token price, remaining supply, subscription percentage, and availability.
4. It displays an operator-supplied image when configured, otherwise a labeled architectural illustration.
5. The visitor chooses a property to inspect.

**Alternatives / failures:**

- No deployment: show a setup state and an option to explore samples.
- Empty deployed contract: show an empty marketplace and an administration action.
- RPC unavailable or contract missing: show an error and retry action; do not silently replace live listings with samples.

**Postcondition:** Listings are visible without requesting wallet access.

**Acceptance:** Opening the marketplace does not call `eth_requestAccounts`.

### UC-02 — Search and filter listings

**Actor:** Visitor. **Trigger:** Enter a search term or change a filter.

**Precondition:** A live or sample catalog is available.

**Main flow:**

1. Enter a property name or location in Search properties.
2. Optionally choose an exact location.
3. Optionally select Available, Sold out, or Inactive.
4. The application combines all selected criteria and updates the result count.
5. Open any matching property.

**Alternatives:** No matches produce an empty result state with Clear filters.
Changing between live and sample catalogs resets the search and filters.

**Postcondition:** Only matching listings are displayed; blockchain data is unchanged.

**Acceptance:** Search ignores capitalization and surrounding whitespace. Inactive
listings are categorized as inactive even when no tokens remain.

### UC-03 — View property details

**Actor:** Visitor. **Trigger:** Select a property name or View property.

**Precondition:** The property exists in the currently selected catalog.

**Main flow:**

1. Open the property detail view.
2. Inspect location, price, total supply, available tokens, and supply subscribed.
3. Read the description and inspect any configured image or document links.
4. If connected, inspect the wallet's holdings for the live property.
5. For an eligible live listing, enter a quantity to preview payment and the represented share.
6. Return to the marketplace using Back to properties.

**Alternatives:** Missing descriptions and documents are explicitly identified.
Inactive, sold-out, or fictional listings cannot prepare a purchase.

**Postcondition:** The visitor understands the recorded listing information without submitting a transaction.

### UC-04 — View supporting documents

**Actor:** Visitor. **Trigger:** Select a document link in property details.

**Precondition:** Valid presentation metadata contains at least one document.

**Main flow:**

1. Inspect the document title and its operator-supplied or sample status.
2. Select the link.
3. The browser opens the document in another tab.

**Alternatives / failures:**

- No documents: show an explicit unavailable state.
- Unsupported or unsafe URL: omit the link.
- Missing file or unavailable host: the destination may fail to load; the app does not authenticate or guarantee the document.

**Postcondition:** An allowed document URL opens without a wallet signature.

**Acceptance:** Links accept root-relative paths or credential-free HTTPS URLs;
executable schemes such as `javascript:` are rejected.

### UC-05 — Explore the fictional sample catalog

**Actor:** Visitor. **Trigger:** Choose Sample preview or Explore the sample catalog.

**Precondition:** None; a wallet and local blockchain are unnecessary.

**Main flow:**

1. Select the sample catalog explicitly.
2. Read the fictional-data notice.
3. Browse, search, filter, and open sample properties.
4. Read the example document and illustrative prices and subscription figures.
5. Return to Live listings when ready.

**Alternatives:** A connected wallet does not make sample listings tradable.

**Postcondition:** The visitor can explore the interface without altering on-chain data.

**Acceptance:** Samples never prepare purchases or transfers and are never passed off as live network results.

## 5. Wallet and transaction use cases

### UC-06 — Connect a wallet

**Actor:** Investor or administrator. **Supporting actor:** Browser wallet.
**Trigger:** Select Connect wallet or Connect wallet to buy.

**Precondition:** A compatible injected browser wallet is installed.

**Main flow:**

1. The application requests wallet accounts.
2. The user approves the connection in the wallet.
3. The application checks the wallet's network against the configured chain.
4. It records the selected address and creates a signer for transactions.
5. It loads wallet-specific holdings and history when the live contract is reachable.
6. It identifies administrator access by comparing the address with the contract owner.

**Alternatives / failures:**

- No wallet: explain installation is needed for transactions; public browsing remains available.
- Rejected request or no selected account: show a connection error.
- Wrong network: show the mismatch and offer Switch network.
- Missing/unreachable deployment: a wallet connection does not enable live transactions by itself.

**Postcondition:** The app knows the selected wallet address. Connecting alone does not buy tokens or move funds.

### UC-07 — Switch to the expected network

**Actor:** Wallet user. **Trigger:** Select Switch network after a mismatch.

**Preconditions:** A compatible wallet is installed and the expected chain is configured.

**Main flow:**

1. The application requests the expected chain through the wallet.
2. The user approves the switch.
3. If the wallet does not know the selected supported network (local Hardhat or Base Sepolia), the application requests adding its public network configuration and explicitly switches to it.
4. The application asks the user to reconnect on the selected network.

**Alternatives:** The user declines, the wallet rejects the RPC configuration,
or the wallet refuses network addition/switching. Other networks are not deployment targets in Phase 1.

**Postcondition:** The selected wallet network is suitable for reconnection, or an actionable error is shown.

### UC-08 — Disconnect or change wallet context

**Actor:** Wallet user. **Trigger:** Use the app's disconnect button, or change account/network in the wallet.

**Precondition:** A wallet connection or wallet event listener exists.

**Main flow:**

1. The user disconnects from the app or the wallet emits an account/network change.
2. The app clears its connected wallet and any unsubmitted transaction review.
3. Wallet-specific dashboard access is cleared; public browsing remains available.
4. For account/network changes, a notification requests reconnection.
5. The user reconnects to load the newly selected account.

**Alternatives:** A submitted transaction may still confirm after a context change.
Disconnecting does not cancel it. A completed transaction's old refresh callback
must not replace the newly selected account's data.

**Postcondition:** The app does not present the previous account's holdings as the new account's holdings.

**Boundary:** App-level disconnect does not revoke permissions in the wallet extension.

### UC-09 — Review and confirm a transaction

**Actor:** Connected wallet user. **Trigger:** Review a purchase, transfer, new listing, or withdrawal.

**Preconditions:** Live data is available; sample mode is off; no other transaction
is being prepared or awaiting completion; the action's validation succeeds.

**Main flow:**

1. The app constructs the proposed contract call and estimates gas.
2. It verifies the expected network and selected account and checks available ETH.
3. It shows the action, sender, network, ETH payment, estimated fee, and estimated total.
4. The user chooses Continue in wallet.
5. The app rechecks wallet context and requests transaction submission.
6. The user approves signing in the wallet.
7. The app shows awaiting approval, pending confirmation, and confirmed status.
8. After success, it refreshes the affected blockchain data.

**Alternatives / failures:**

- Cancel or close the review: no transaction is submitted.
- Wallet rejection: show cancellation/failure feedback without claiming success.
- Estimation failure, insufficient ETH, or invalid input: show an error before submission.
- Changed wallet/network: require reconnection and review again.
- Revert or submission failure: show failure; a mined reverted transaction can still consume gas.
- Non-cancelled transaction replacement: use the replacement receipt when it succeeds.

**Postcondition:** Success is reported after a successful receipt, or failure is reported without fabricating a state change.

**Fee rule:** The estimate uses a gas limit with a 20% buffer and the RPC's fee estimate.
It is not a guaranteed final charge; the wallet supplies final signing details.

## 6. Investor use cases

### UC-10 — Purchase property tokens

**Actor:** Investor or administrator. **Trigger:** Review purchase in a live property's details.

**Preconditions:** Connected wallet on the correct chain; existing active property;
positive whole-number quantity within remaining supply; sufficient ETH for payment and gas.

**Main flow:**

1. Enter the desired quantity.
2. The app computes `quantity × pricePerToken` using integer wei arithmetic.
3. Inspect the payment and represented percentage of total supply.
4. Complete UC-09.
5. The contract validates the property, active status, quantity, available supply, and exact ETH payment.
6. It reduces available tokens, increases the buyer's balance, retains the ETH, and emits `TokensPurchased`.
7. The app refreshes listing data and the buyer's portfolio/history.

**Alternatives / failures:** Zero, negative, fractional, excessive, or invalid quantities
are rejected. Sold-out/inactive properties cannot be purchased. Supply may change
after review; the contract can reject a transaction that no longer satisfies its rules.
Direct callers sending too much or too little ETH are also rejected.

**Postcondition:** Buyer holdings increase and available supply decreases by exactly
the purchased quantity. The contract receives exactly the token payment.

**Example:** Buying 10 of 1,000 tokens at 0.01 ETH costs 0.1 ETH plus gas,
represents 1.00% of supply, and leaves 990 tokens available on an initially unsold listing.

### UC-11 — View holdings and ownership percentages

**Actor:** Token holder. **Trigger:** Open My portfolio.

**Preconditions:** Wallet connected and current contract data reachable.

**Main flow:**

1. The app reads the wallet's token balance for each property.
2. It displays properties with nonzero holdings.
3. It shows token quantities, represented supply percentages, and listing prices.
4. It summarizes property count, aggregate token count, and value at listing prices.
5. The holder opens a property or refreshes balances.

**Alternatives:** Disconnected users receive a connection prompt; zero holdings
produce an empty state; network failure produces an unavailable state.

**Postcondition:** The dashboard reflects the selected wallet's recorded balances.

**Interpretation:** Aggregate token count combines different properties' token units.
Value at listing prices is not cost basis, an appraisal, a resale quote, or guaranteed proceeds.
Percentages are truncated to two decimal places rather than rounded up.

### UC-12 — View purchase and transfer history

**Actor:** Connected wallet user. **Trigger:** Open or refresh My portfolio.

**Preconditions:** Deployed contract and an RPC capable of serving its event history.

**Main flow:**

1. The app queries the wallet's purchase, outgoing transfer, and incoming transfer events.
2. It reads logs from the configured deployment block, or block zero for older deployment metadata.
3. It deduplicates matching logs and orders activity newest first by block and log index.
4. It displays action, quantity, property, purchase cost or counterparty, block number, and transaction hash.
5. The user expands an entry to inspect its hash.

**Alternatives:** No events produce an empty activity state. Log-read failure shows
a separate history error without claiming that confirmed holdings are unavailable.
Self-transfers appear once and are classified as Sent by the current interface.

**Postcondition:** The wallet can inspect its confirmed purchase/transfer records.

**Boundary:** This view does not include pending transactions, all wallet activity,
administrator withdrawals, or a downloadable account statement.

### UC-13 — Transfer property tokens

**Actor:** Token holder. **Supporting actor:** Recipient.
**Trigger:** Review transfer in My portfolio.

**Preconditions:** Connected holder; existing property; positive whole-number quantity
within the sender's balance; valid nonzero recipient; enough ETH for gas.

**Main flow:**

1. Select a held property.
2. Enter the recipient address and quantity.
3. Review the recipient and gas estimate through UC-09.
4. The contract checks the property, address, quantity, and sender balance.
5. It subtracts tokens from the sender, adds them to the recipient, and emits `TokensTransferred`.
6. The app refreshes holdings and history.
7. The recipient can connect their wallet separately to inspect the received balance.

**Alternatives:** Invalid/zero address, zero/fractional quantity, insufficient tokens,
wallet rejection, or insufficient gas funds produce errors. Changes after review
are validated again by the contract. Transfers remain possible for inactive or sold-out listings.

**Postcondition:** Total supply and available unsold tokens are unchanged.
There is no automatic sale payment to the sender.

**Edge case:** The contract permits transfer to the sender's own address; the net
token balance is unchanged, but the transaction consumes gas and emits an event.

## 7. Administrator use cases

### UC-14 — Access the administrator workspace

**Actor:** Administrator. **Trigger:** Open Administration.

**Preconditions:** A wallet can connect and the contract is reachable.

**Main flow:**

1. Connect the deployment wallet.
2. The app compares its address with `owner()`.
3. The matching wallet receives the listing form and treasury controls.

**Alternatives:** Disconnected users receive a connection prompt. Other wallets
receive an access-required state. Direct unauthorized calls to owner-only functions revert.

**Postcondition:** Only the deployment wallet can successfully perform restricted contract actions.

### UC-15 — Create a property listing

**Actor:** Administrator. **Trigger:** Review new listing.

**Preconditions:** UC-14 succeeds; valid nonempty name/location; positive total token
supply and price; enough ETH for transaction gas.

**Main flow:**

1. Enter property name, location, total tokens, and price per token in ETH.
2. The app trims text, validates supply and price, and converts the price to wei.
3. Complete UC-09.
4. The contract assigns the next property ID, starting at 1.
5. It records fixed total supply and price, makes all tokens available, and sets active status to true.
6. It emits `PropertyCreated`.
7. The app clears the successful form and refreshes the marketplace.

**Alternatives:** Unauthorized caller, invalid/empty fields, zero supply, zero price,
or wallet failure prevent listing creation. The contract checks nonempty byte strings;
the UI additionally rejects whitespace-only names/locations after trimming.

**Postcondition:** One new active property exists. Creating it does not credit tokens
to the administrator's holdings; the supply initially remains available for purchase.

**Boundary:** The current contract cannot edit price, supply, name, or location after
creation and has no property deletion function. Off-chain descriptions are managed separately.

### UC-16 — View collected funds

**Actor:** Administrator. **Trigger:** Open or refresh Administration.

**Preconditions:** Correct administrator wallet and reachable live contract.

**Main flow:**

1. The app reads the contract's ETH balance through the RPC.
2. It displays the amount in Contract treasury.
3. It enables withdrawal review when funds are present and no operation is in progress.

**Alternatives:** Zero balance disables withdrawal. Loading, network errors, or
unauthorized wallet context prevent displaying active administrator controls.

**Postcondition:** The administrator can inspect the recorded treasury amount.

**Boundary:** Solidity's `getContractBalance()` helper is owner-only, but the ETH
balance of a public blockchain address is not private. The frontend uses the RPC balance read.

### UC-17 — Withdraw collected funds

**Actor:** Administrator. **Trigger:** Review withdrawal.

**Preconditions:** Owner wallet connected; nonzero contract balance; enough ETH to pay gas.

**Main flow:**

1. Inspect the treasury and choose withdrawal.
2. Review that the entire contract balance will be sent to the administrator.
3. Complete UC-09.
4. The contract checks owner permission and a nonzero balance.
5. It sends the balance to the owner and checks transfer success.
6. It emits `FundsWithdrawn` and the app refreshes the treasury.

**Alternatives:** Unauthorized caller or empty balance reverts. If the receiving
owner contract rejects payment, the withdrawal reverts. Wallet rejection produces no submitted withdrawal.

**Postcondition:** The withdrawn amount reaches the owner; the contract balance
becomes zero for that withdrawal, absent additional incoming funds. Token holdings are unchanged.

**Boundary:** There are no partial withdrawals, project milestones, investor approvals,
escrow funding targets, or restrictions tying withdrawal to a property's sale completion.

### UC-18 — Activate or deactivate purchases

**Actor:** Administrator. **Status:** Application.
**Trigger:** Select Activate or Deactivate in Administration → Property listings.

**Preconditions:** Owner caller and existing property ID.

**Main flow:**

1. Choose an existing property and select Activate or Deactivate.
2. Review the proposed change; acknowledge the consequences for deactivation, then confirm the owner-signed transaction through UC-09.
3. The contract updates the status and emits `PropertyStatusChanged`.
4. Refresh the React marketplace to see the updated status.

**Alternatives:** Unauthorized callers and nonexistent IDs revert. The function
permits setting the current status again; it does not require a state transition.

**Postcondition:** New purchases are allowed only while active and supply remains.
Existing balances and transfers are unaffected.

## 8. Maintenance and recovery use cases

### UC-19 — Refresh data and recover from connection failures

**Actor:** Visitor or connected wallet user. **Trigger:** Select Refresh, Refresh balances, or Retry connection.

**Precondition:** The website is loaded.

**Main flow:**

1. Request fresh data from the configured RPC.
2. Check chain identity and deployed contract code.
3. Reload live properties and, when connected, holdings and history.
4. Present refreshed data or a clear unavailable state.

**Alternatives:** Start the local node if it stopped; redeploy if the chain reset;
restart the frontend after deployment metadata changes; reconnect after wallet changes.
History-only failure is reported separately. Samples remain an explicit user choice.

**Postcondition:** The application either shows verified reads from the selected
deployment or an error instead of silently inventing live results.

**Boundary:** The app refreshes on connection and successful transactions and offers
manual refresh. It does not promise continuous event subscriptions or real-time synchronization.

### UC-20 — Supply descriptions, photographs, and documents

**Actor:** Maintainer. **Trigger:** Enrich a live listing's presentation.

**Preconditions:** The property and its deployment identity are known; the maintainer
has appropriate public assets and permission to distribute them.

**Main flow:**

1. Add an entry in `react-frontend/src/data/property-metadata.json` using
   `chainId:lowercaseContractAddress:propertyId` as its key.
2. Supply a description and optional image URL, alternative text, caption, and document links.
3. Place public files under `react-frontend/public/` or use public HTTPS URLs.
4. Rebuild/reload the frontend and inspect the details page.

**Alternatives:** Missing/broken photos fall back to a labeled architectural
illustration. Unsupported document URLs are omitted. Missing documents/descriptions
produce explicit unavailable text.

**Postcondition:** Presentation metadata supplements the listing without overriding
on-chain price, supply, availability, owner balance, or active status.

**Boundary:** No administrator upload form, verification service, private file
storage, or identity-document handling exists. A reset local chain may reuse the
same address and IDs, so metadata must be reviewed after resets.

### UC-21 — Set up and deploy the local demo

**Actor:** Developer. **Trigger:** Prepare a new checkout or restart a local environment.

**Preconditions:** Supported Node 22/npm installed; initial dependency/compiler
downloads available; compatible wallet needed only for interactive transactions.

**Main flow:**

1. Run `npm run setup` to install the root and frontend dependencies from lockfiles.
2. Run `npm run compile` to compile Solidity and synchronize the frontend ABI.
3. In Terminal 1, run `npm run node` and keep it running.
4. In Terminal 2, run `npm run deploy:local`.
5. Deployment records the address, chain ID, deployment block, and transaction hash,
   and automatically synchronizes the frontend ABI/configuration.
6. In Terminal 3, run `npm run dev` and open the printed URL.
7. Configure the wallet for RPC `http://127.0.0.1:8545`, chain ID `31337`.
8. Import funded local development accounts for administrator/investor demonstrations.

**Alternatives:** A stopped node prevents localhost deployment. Running the deploy
script against Hardhat's default temporary network is rejected with an instruction
to use the supported localhost workflow. Restarting the node clears local state:
redeploy, restart the frontend, and recreate listings.

**Postcondition:** A working local chain and frontend share generated deployment configuration.

**Boundary:** Local Hardhat keys are public development keys for test funds only.
The optional Ignition module does not itself synchronize the frontend configuration.

### UC-22 — Verify and build the project

**Actor:** Developer. **Trigger:** Check changes or prepare a frontend build.

**Precondition:** Dependencies installed.

**Main flow:**

1. Run `npm test` for the contract suite.
2. Run `npm run test:frontend` for calculation, validation, filtering, and data-read checks.
3. Run `npm run build` for a production frontend bundle.
4. Optionally run `npm run preview` to serve the generated bundle locally.

**Alternatives:** Resolve failed tests/builds before treating the change as verified.
A build can succeed without deployment metadata, but that bundle cannot transact
until the correct deployment is included in a new build.

**Postcondition:** Verification results are available and the frontend bundle is generated.

**Boundary:** Building or previewing does not publish to GitHub or deploy a public website.
For live deployed browsing, the frontend needs a browser-accessible RPC; localhost
always refers to the visitor's own machine.

## 9. Shared business rules

### Phase 1 platform use cases

#### UC-23 — Deploy the existing contract to Base Sepolia

**Actor:** Developer. **Preconditions:** Dedicated test-wallet key and HTTPS RPC
configured outside source control; sufficient Base Sepolia test ETH.

**Flow:** Run `npm run deploy:base-sepolia`; validate supported network and signer;
confirm actual chain ID; deploy the unchanged contract; write the public
network-specific manifest after a successful receipt. The deployment caller
remains owner and no properties are automatically seeded.

**Failures:** Missing/invalid key, insufficient test balance, wrong RPC chain, or
reverted deployment produce errors. No mainnet target is supported. Do not retry
blindly after a successful transaction whose local file write failed.

**Postcondition:** A separate Base Sepolia contract and reviewed public deployment
facts exist; localhost metadata and contract permissions are unchanged.

#### UC-24 — Verify deployed contract source

**Actor:** Developer. **Preconditions:** Public Base Sepolia manifest, matching
source/artifact, reachable chain, and private Etherscan V2 API key.

**Flow:** Run `npm run verify:base-sepolia`; check recorded chain and bytecode;
submit source with no constructor arguments; inspect the explorer code page.

**Failures:** Missing API key/record, mismatched bytecode, explorer indexing delay,
or API refusal produce errors. Verification does not deploy another contract or
require an investor/private signing key.

**Postcondition:** Source is published/matched by the explorer, or verification
remains explicitly pending. This is not a security audit or property verification.

#### UC-25 — Build and publish a public testnet demo

**Actor:** Maintainer. **Preconditions:** Actual Base Sepolia deployment address and
receipt block, browser-safe HTTPS RPC, and an HTTPS static host.

**Flow:** Select Base Sepolia through testnet mode/public env values; run
`npm run build:testnet`; upload only `react-frontend/dist`; verify public reads,
wallet onboarding, test transactions, and sample/live separation.

**Failures:** Missing/wrong-network metadata, invalid address/block, insecure RPC,
or common secret-prefixed variables stop the build. Runtime reads separately
check the chain and deployed code; configuration validation is not proof of deployment.

**Postcondition:** A publicly accessible test-funds demo is configured without
shipping Node-side deployment secrets. Hosting and real-wallet acceptance are manual.

#### UC-26 — Run automated repository checks

**Actor:** Contributor / GitHub Actions. **Trigger:** Push, pull request, or workflow dispatch.

**Flow:** Install from lockfiles; run deployment-config and contract tests; compile
and check ABI freshness; run frontend tests and ordinary/testnet-mode builds.
The CI testnet build uses explicitly synthetic public configuration only.

**Failures:** Any failed test/config validation/build fails its CI job. GitHub must
have Actions enabled; required PR checks are configured by a repository maintainer.

**Postcondition:** Check results exist without signing keys, real funds, automatic
deployment, source verification, backend implementation, or database migrations.

### Application rules

| Rule                   | Current behavior                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Administrator identity | `owner` is fixed to the deployment caller; no ownership-transfer function exists.                                        |
| Property identity      | IDs start at 1 and increase per added listing.                                                                           |
| Supply accounting      | For each property, available supply plus all wallet balances equals total supply.                                        |
| Token precision        | Whole-number token quantities; ETH prices/payments use integer wei.                                                      |
| Purchase payment       | `msg.value` must exactly equal quantity multiplied by price.                                                             |
| Purchase availability  | Property exists, is active, and has enough unsold tokens.                                                                |
| Transfer availability  | Property exists and sender has enough tokens; active status is not required.                                             |
| Withdrawal permission  | Owner only; withdraws the whole nonzero contract balance.                                                                |
| Read permissions       | Property details and balances are publicly readable; the balance helper is owner-only but address ETH balance is public. |
| Metadata authority     | Source-configured presentation information never replaces on-chain financial fields.                                     |
| Sample isolation       | Fictional samples are explicitly selected and cannot transact.                                                           |
| Gas                    | State-changing operations require gas, including transfers and administrative actions.                                   |
| Portfolio percentages  | Recorded wallet tokens divided by fixed property supply; not verified legal ownership.                                   |

## 10. Contract traceability

| Use case              | Contract calls / reads                                               | Relevant event                         |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| UC-01 / UC-03 / UC-19 | `propertyCount()`, `getProperty(id)`                                 | Reads only                             |
| UC-06 / UC-14         | `owner()`                                                            | Reads only                             |
| UC-10                 | `buyTokens(id, amount)` with exact ETH payment                       | `TokensPurchased`                      |
| UC-11                 | `getTokenBalance(id, wallet)`                                        | Reads only                             |
| UC-12                 | Wallet-filtered event-log queries                                    | `TokensPurchased`, `TokensTransferred` |
| UC-13                 | `transferTokens(id, recipient, amount)`                              | `TokensTransferred`                    |
| UC-15                 | `addProperty(name, location, supply, priceWei)`                      | `PropertyCreated`                      |
| UC-16                 | RPC address balance read; optional owner-only `getContractBalance()` | Reads only                             |
| UC-17                 | `withdrawFunds()`                                                    | `FundsWithdrawn`                       |
| UC-18                 | `setPropertyStatus(id, active)`                                      | `PropertyStatusChanged`                |

The contract also exposes generated getters for `properties` and `ownership`.
These are alternative public reads of stored state, rather than additional business workflows.

## 11. End-to-end demonstration and acceptance scenarios

Use a fresh local deployment and three funded development wallets: administrator A,
investor B, and recipient C. This sequence is an acceptance checklist, not a claim
that every item has a dedicated automated test.

| Scenario              | Actions                                                             | Expected result                                                                   |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Public access         | Open the website without a wallet connection.                       | Live listings load when configured; browsing requests no wallet signature.        |
| Sample preview        | Explicitly select a sample and inspect its document.                | Fictional-data label is visible; no purchase action is available.                 |
| Administrator access  | Connect A and open Administration.                                  | Listing and treasury controls appear.                                             |
| Initial listing       | A creates 1,000 tokens at 0.01 ETH for Cyberjaya Condo.             | Property #1 is active with all 1,000 tokens available; A owns zero unless A buys. |
| Filter                | Search Cyberjaya and choose Available.                              | Matching listing remains visible.                                                 |
| Purchase cancellation | B reviews 10 tokens and cancels before wallet submission.           | No tokens or payment move.                                                        |
| Purchase success      | B reviews and confirms 10 tokens.                                   | B owns 10, available supply is 990, treasury receives 0.1 ETH; gas is separate.   |
| Investor dashboard    | B opens My portfolio.                                               | Property share is 1.00%; confirmed purchase history is visible.                   |
| Invalid transfer      | B attempts 11 tokens while owning 10.                               | Review/contract rejects it; no tokens move.                                       |
| Transfer success      | B transfers 3 tokens to C.                                          | B owns 7, C owns 3, available supply stays 990.                                   |
| Recipient view        | C connects and opens My portfolio.                                  | Holding of 3 tokens, 0.30% share, and received activity appear.                   |
| Permission check      | B attempts an owner-only contract operation.                        | The contract rejects the call.                                                    |
| Deactivation          | A reviews and confirms Deactivate in the property management table. | Purchases stop; existing transfers remain possible.                               |
| Reactivation          | A sets the same property active again.                              | Purchases are allowed when unsold supply remains.                                 |
| Withdrawal            | A confirms withdrawal.                                              | Collected funds are sent to A; B/C token balances do not change.                  |
| Wallet rejection      | Reject a signing request.                                           | Failure/cancellation feedback appears; no successful action is reported.          |
| Wrong network         | Connect a wallet on a different chain.                              | Mismatch is explained and network switching is offered.                           |
| Account change        | Change from B to C in the wallet.                                   | Old wallet context clears; reconnect loads C's data.                              |
| Network failure       | Stop the read-only RPC and refresh.                                 | Live availability error appears; samples are not substituted automatically.       |
| Sold-out listing      | Purchase all remaining tokens of a test listing.                    | The listing is sold out and new purchases are unavailable.                        |

## 12. Future use cases — not implemented

These are potential extensions, not features of the current project and not promises
about its suitability for real investment operations.

| ID     | Proposed use case                            | Major prerequisite                                                                          |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| FUT-01 | Investor eligibility / identity verification | Defined eligibility policy, private identity handling, and appropriate service integration. |
| FUT-02 | Funding targets and deadlines                | New contract lifecycle and explicit success/failure rules.                                  |
| FUT-03 | Escrow and campaign refunds                  | Fund segregation, withdrawal restrictions, and refund accounting.                           |
| FUT-04 | Rental income distribution                   | Defined entitlements, periods, expenses, and transfer-aware accounting.                     |
| FUT-05 | Paid secondary-market trades                 | Order/payment settlement, eligibility rules, and trading terms.                             |
| FUT-06 | Standard token interoperability              | Deliberate token-standard selection and migration to a new deployment.                      |
| FUT-07 | Property sale and redemption                 | Clear token-holder rights and a settlement/redemption mechanism.                            |
| FUT-08 | Multi-role or multisignature administration  | Contract access-control and operational-policy changes.                                     |
| FUT-09 | Photo/document upload and verification       | Authenticated storage, moderation, asset permissions, and verification procedures.          |
| FUT-10 | Statements, notifications, and reporting     | Reporting requirements, event indexing, and delivery infrastructure.                        |
| FUT-11 | Verified linkage to real property rights     | Defined legal/operational structure and independently checked supporting records.           |

## 13. Implementation references

- [Solidity contract](contracts/RealEstateTokenization.sol): data model, permissions, purchase/transfer/withdrawal rules, and events.
- [React application](react-frontend/src/App.jsx): page composition, shared feedback, and navigation.
- [Wallet and action hook](react-frontend/src/hooks/useBrickShare.js): wallet connection, transaction reviews, receipt confirmation, and administrator actions.
- [Frontend architecture](react-frontend/DESIGN.md): the dedicated landing, marketplace, property, portfolio, and administrator pages and shared components.
- [Marketplace hook](react-frontend/src/hooks/useMarketplace.js): read-only loading, wallet context isolation, and recovery states.
- [Marketplace helpers](react-frontend/src/lib/marketplace.js): precise arithmetic, filters, URL validation, and event queries.
- [Presentation metadata guide](react-frontend/PROPERTY_METADATA.md): public descriptions, images, and supporting documents.
- [Deployment script](scripts/deploy.js): contract deployment and generated frontend configuration.
- [Setup guide](README.md): supported commands and local environment instructions.

Archived HTML interfaces are historical references and are outside the main application's use-case scope.
