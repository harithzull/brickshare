import abi from "./generated/RealEstateTokenization.abi.json";
import networks from "../../config/networks.json";
import { resolveChainConfig } from "./lib/chain-config";

// A fresh clone has no local deployment. Vite includes this file when present.
// scripts/deploy.js generates it; never paste deployment addresses by hand.
const deployments = import.meta.glob("./generated/deployment.json", {
  eager: true,
  import: "default",
});
const testnetDeployments = import.meta.glob(
  "../../deployments/baseSepolia.json",
  { eager: true, import: "default" }
);
export const CHAIN = resolveChainConfig({
  env: import.meta.env,
  mode: import.meta.env.MODE,
  networks,
  deployments: {
    localhost: deployments["./generated/deployment.json"],
    baseSepolia: testnetDeployments["../../deployments/baseSepolia.json"],
  },
});

export const CONTRACT_ADDRESS = CHAIN.address;
export const EXPECTED_CHAIN_ID = CHAIN.chainId;
export const CONTRACT_ABI = abi;
export const DEPLOYMENT_BLOCK = CHAIN.blockNumber;
// A read-only RPC lets visitors browse without MetaMask or a wallet connection.
export const RPC_URL = CHAIN.rpcUrl;
export const EXPLORER_URL = CHAIN.explorerUrl;
export const WALLET_NETWORK = CHAIN.walletParameters;

export const NETWORK_NAMES = {
  31337: "Hardhat (localhost)",
  1337: "Ganache (localhost)",
  11155111: "Sepolia testnet",
  84532: "Base Sepolia",
};
