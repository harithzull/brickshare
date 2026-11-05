import { ethers } from "ethers";

export async function switchToConfiguredChain(ethereum, parameters) {
  const requestSwitch = () =>
    ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: parameters.chainId }],
    });
  try {
    await requestSwitch();
  } catch (error) {
    if (error.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [parameters],
    });
    await requestSwitch();
  }
}

export function resolveChainConfig({
  env = {},
  mode = "development",
  deployments = {},
  networks,
}) {
  for (const [name, value] of Object.entries(env)) {
    if (
      value &&
      name.startsWith("VITE_") &&
      /PRIVATE_KEY|MNEMONIC|SECRET|ETHERSCAN_API_KEY/.test(name)
    ) {
      throw new Error(
        "Deployment secrets must never use VITE_ names or be supplied to a frontend build."
      );
    }
  }
  const networkName =
    env.VITE_NETWORK?.trim() ||
    (mode === "testnet" ? "baseSepolia" : "localhost");
  const chain = networks[networkName];
  if (!chain || ![31337, 84532].includes(chain.chainId))
    throw new Error(
      "VITE_NETWORK must be localhost or baseSepolia. Mainnet is not supported."
    );
  if (mode === "testnet" && networkName !== "baseSepolia")
    throw new Error(
      "The testnet build requires VITE_NETWORK=baseSepolia; localhost cannot be published as the testnet demo."
    );
  const record = deployments[networkName];
  if (record && Number(record.chainId) !== chain.chainId)
    throw new Error(
      "Deployment record chainId does not match VITE_NETWORK. Select the matching network record."
    );
  const override = env.VITE_CONTRACT_ADDRESS?.trim();
  const rawAddress = override || record?.address || null;
  let address = null;
  if (rawAddress) {
    try {
      address = ethers.utils.getAddress(rawAddress);
    } catch {
      throw new Error(
        "VITE_CONTRACT_ADDRESS or the selected deployment record contains an invalid address."
      );
    }
    if (address === ethers.constants.AddressZero)
      throw new Error("The contract address cannot be zero.");
  }
  const hasBlock = String(env.VITE_DEPLOYMENT_BLOCK ?? "").trim() !== "";
  const sameRecord =
    address && record?.address?.toLowerCase() === address.toLowerCase();
  if (networkName === "baseSepolia" && override && !sameRecord && !hasBlock)
    throw new Error(
      "Set VITE_DEPLOYMENT_BLOCK with an overridden Base Sepolia contract address to bound event-history reads."
    );
  const rawBlock = hasBlock
    ? String(env.VITE_DEPLOYMENT_BLOCK).trim()
    : sameRecord
    ? record.blockNumber
    : 0;
  const blockNumber = Number(rawBlock);
  if (
    !/^\d+$/.test(String(rawBlock)) ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0
  )
    throw new Error(
      "VITE_DEPLOYMENT_BLOCK must be a nonnegative safe integer."
    );
  if (networkName === "baseSepolia" && (!address || blockNumber === 0))
    throw new Error(
      "Base Sepolia needs a real deployed address and deployment block: commit deployments/baseSepolia.json or set VITE_CONTRACT_ADDRESS and VITE_DEPLOYMENT_BLOCK."
    );
  const rpcUrl = env.VITE_RPC_URL?.trim() || chain.rpcUrl;
  try {
    const rpc = new URL(rpcUrl);
    if (rpc.username || rpc.password) throw new Error();
    if (
      networkName === "baseSepolia" &&
      (rpc.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(rpc.hostname))
    )
      throw new Error();
    if (
      networkName === "localhost" &&
      !["http:", "https:"].includes(rpc.protocol)
    )
      throw new Error();
  } catch {
    throw new Error(
      "VITE_RPC_URL must be a browser-safe HTTP(S) URL; Base Sepolia requires a public HTTPS endpoint without URL credentials."
    );
  }
  return {
    networkName,
    chainId: chain.chainId,
    name: chain.name,
    displayName: chain.displayName,
    address,
    blockNumber,
    rpcUrl,
    explorerUrl: chain.explorerUrl,
    walletParameters: {
      chainId: ethers.utils.hexValue(chain.chainId),
      chainName: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: [networkName === "localhost" ? rpcUrl : chain.rpcUrl],
      ...(chain.explorerUrl ? { blockExplorerUrls: [chain.explorerUrl] } : {}),
    },
  };
}
