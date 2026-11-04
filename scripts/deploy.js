const hre = require("hardhat");
const { syncAbi, writeGeneratedJson } = require("./sync-frontend");

async function main() {
  if (hre.network.name === "hardhat") {
    throw new Error(
      "Use npm run deploy:local with npm run node running in another terminal. The default Hardhat network is temporary."
    );
  }
  const RealEstateTokenization = await hre.ethers.getContractFactory(
    "RealEstateTokenization"
  );
  const contract = await RealEstateTokenization.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const { chainId } = await hre.ethers.provider.getNetwork();
  const receipt = await contract.deploymentTransaction().wait();
  syncAbi();
  writeGeneratedJson("deployment.json", {
    address,
    chainId: Number(chainId),
    blockNumber: receipt.blockNumber,
    transactionHash: contract.deploymentTransaction().hash,
  });

  console.log("RealEstateTokenization deployed to:", address);
  console.log("Chain ID:", chainId.toString());
  console.log(
    "Frontend ABI and deployment configuration updated automatically."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
