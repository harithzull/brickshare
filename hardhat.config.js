require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
const {
  loadDeploymentEnv,
  deploymentAccounts,
  deploymentRpc,
  networks,
} = require("./config/deployment");

loadDeploymentEnv();

module.exports = {
  solidity: "0.8.19",
  networks: {
    localhost: {
      url: process.env.LOCALHOST_RPC_URL || networks.localhost.rpcUrl,
      chainId: networks.localhost.chainId,
    },
    baseSepolia: {
      url: deploymentRpc(),
      chainId: networks.baseSepolia.chainId,
      accounts: deploymentAccounts(),
    },
  },
  // A string key selects Etherscan V2 in hardhat-verify 2.1.x.
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" },
  sourcify: { enabled: false },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
