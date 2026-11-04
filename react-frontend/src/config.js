import abi from "./generated/RealEstateTokenization.abi.json";

// A fresh clone has no local deployment. Vite includes this file when present.
// scripts/deploy.js generates it; never paste deployment addresses by hand.
const deployments = import.meta.glob("./generated/deployment.json", {
  eager: true,
  import: "default",
});
const deployment = deployments["./generated/deployment.json"];

export const CONTRACT_ADDRESS = deployment?.address ?? null;
export const EXPECTED_CHAIN_ID = deployment?.chainId ?? 31337;
export const CONTRACT_ABI = abi;
export const DEPLOYMENT_BLOCK = deployment?.blockNumber ?? 0;
// A read-only RPC lets visitors browse without MetaMask or a wallet connection.
export const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  (EXPECTED_CHAIN_ID === 31337 ? "http://127.0.0.1:8545" : null);

export const NETWORK_NAMES = {
  31337: "Hardhat (localhost)",
  1337: "Ganache (localhost)",
  11155111: "Sepolia testnet",
};
