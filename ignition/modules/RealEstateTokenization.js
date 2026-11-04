// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://v2.hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("RealEstateTokenizationModule", (m) => {
  const realEstateTokenization = m.contract("RealEstateTokenization", []);

  return { realEstateTokenization };
});
