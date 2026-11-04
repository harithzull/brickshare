# BrickShare — Front-End (Member 4)

Front-end UI for the **Real Estate Tokenization Platform** dApp.
Connects to the `RealEstateTokenization.sol` contract via MetaMask + ethers.js v5.

## Files
- `index.html` — the entire UI and logic (open this in a browser).
- `config.js` — holds the contract **address** and **ABI**. Edit this, not the HTML.

## One-time setup before the demo

1. **Paste the contract address.**
   Open `config.js` and replace `PASTE_YOUR_CONTRACT_ADDRESS_HERE` with the address
   Member 3 got when they deployed (it's printed by the deploy script).

2. **Set the network.**
   In `index.html`, find `EXPECTED_CHAIN_ID`.
   - Local Ganache → `1337` (default; already set).
   - Sepolia testnet → change it to `11155111`.

3. **Match MetaMask to that network.**
   - **Ganache:** In MetaMask, add a network → RPC URL `http://127.0.0.1:7545`
     (or `:8545`), Chain ID `1337`. Then import a Ganache account using its
     private key so you have test ETH.
   - **Sepolia:** Just select Sepolia in MetaMask and fund it from a faucet.

## How to run

You can't just double-click `index.html` reliably (MetaMask needs a real
`http://` origin, not `file://`). Use any tiny local server:

**Option A — Python (already on most machines):**
```bash
cd realestate-frontend
python -m http.server 8000
```
Then open <http://localhost:8000> in the browser that has MetaMask.

**Option B — VS Code:** install the "Live Server" extension, right-click
`index.html` → "Open with Live Server".

## What the UI does (maps to the rubric)
- Connects to MetaMask and shows the wallet address.
- Warns if MetaMask is on the wrong network.
- Shows whether you're the **owner** or an **investor**.
- **Read** functions: lists all properties, shows your token balance.
- **Write** functions: Add property (owner), Buy tokens, Transfer tokens, Withdraw (owner).
- Every write shows transaction status: *confirm → pending → confirmed / failed*.
- Errors are shown in plain English, not raw Solidity revert strings.

## Demo tip
Use two MetaMask accounts (the owner + one investor) so you can show:
add property → buy tokens → transfer tokens → withdraw. That covers
every function on camera.
