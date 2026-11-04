const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RealEstateTokenization", function () {
  let contract;
  let owner;
  let buyer;
  let receiver;
  let outsider;

  const propertyName = "Cyberjaya Condo";
  const propertyLocation = "Cyberjaya";
  const totalTokens = 1000;
  const tokenPrice = ethers.parseEther("0.01");

  async function addDefaultProperty() {
    await contract.addProperty(
      propertyName,
      propertyLocation,
      totalTokens,
      tokenPrice
    );
  }

  beforeEach(async function () {
    [owner, buyer, receiver, outsider] = await ethers.getSigners();

    const RealEstateTokenization = await ethers.getContractFactory(
      "RealEstateTokenization"
    );

    contract = await RealEstateTokenization.deploy();
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the deployer as the owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should start with zero properties", async function () {
      expect(await contract.propertyCount()).to.equal(0);
    });
  });

  describe("addProperty", function () {
    it("Should allow owner to add a property", async function () {
      await contract.addProperty(
        propertyName,
        propertyLocation,
        totalTokens,
        tokenPrice
      );

      expect(await contract.propertyCount()).to.equal(1);

      const property = await contract.getProperty(1);

      expect(property.id).to.equal(1);
      expect(property.name).to.equal(propertyName);
      expect(property.location).to.equal(propertyLocation);
      expect(property.totalTokens).to.equal(totalTokens);
      expect(property.availableTokens).to.equal(totalTokens);
      expect(property.tokenPrice).to.equal(tokenPrice);
      expect(property.active).to.equal(true);
    });

    it("Should reject non-owner from adding property", async function () {
      await expect(
        contract.connect(outsider).addProperty(
          propertyName,
          propertyLocation,
          totalTokens,
          tokenPrice
        )
      ).to.be.reverted;
    });

    it("Should reject empty property name", async function () {
      await expect(
        contract.addProperty("", propertyLocation, totalTokens, tokenPrice)
      ).to.be.reverted;
    });

    it("Should reject zero total tokens", async function () {
      await expect(
        contract.addProperty(propertyName, propertyLocation, 0, tokenPrice)
      ).to.be.reverted;
    });

    it("Should reject zero token price", async function () {
      await expect(
        contract.addProperty(propertyName, propertyLocation, totalTokens, 0)
      ).to.be.reverted;
    });
  });

  describe("buyTokens", function () {
    beforeEach(async function () {
      await addDefaultProperty();
    });

    it("Should allow user to buy tokens with correct ETH amount", async function () {
      const amount = 2;
      const totalCost = tokenPrice * BigInt(amount);

      await contract.connect(buyer).buyTokens(1, amount, {
        value: totalCost,
      });

      expect(await contract.getTokenBalance(1, buyer.address)).to.equal(2);

      const property = await contract.getProperty(1);
      expect(property.availableTokens).to.equal(998);
    });

    it("Should reject buying from non-existing property", async function () {
      await expect(
        contract.connect(buyer).buyTokens(99, 1, {
          value: tokenPrice,
        })
      ).to.be.reverted;
    });

    it("Should reject buying zero tokens", async function () {
      await expect(
        contract.connect(buyer).buyTokens(1, 0, {
          value: 0,
        })
      ).to.be.reverted;
    });

    it("Should reject buying more tokens than available", async function () {
      const amount = 1001;
      const totalCost = tokenPrice * BigInt(amount);

      await expect(
        contract.connect(buyer).buyTokens(1, amount, {
          value: totalCost,
        })
      ).to.be.reverted;
    });

    it("Should reject incorrect ETH amount", async function () {
      await expect(
        contract.connect(buyer).buyTokens(1, 2, {
          value: tokenPrice,
        })
      ).to.be.reverted;
    });
  });

  describe("transferTokens", function () {
    beforeEach(async function () {
      await addDefaultProperty();

      const amount = 2;
      const totalCost = tokenPrice * BigInt(amount);

      await contract.connect(buyer).buyTokens(1, amount, {
        value: totalCost,
      });
    });

    it("Should allow token holder to transfer tokens", async function () {
      await contract.connect(buyer).transferTokens(1, receiver.address, 1);

      expect(await contract.getTokenBalance(1, buyer.address)).to.equal(1);
      expect(await contract.getTokenBalance(1, receiver.address)).to.equal(1);
    });

    it("Should reject transfer to zero address", async function () {
      await expect(
        contract.connect(buyer).transferTokens(1, ethers.ZeroAddress, 1)
      ).to.be.reverted;
    });

    it("Should reject transferring zero tokens", async function () {
      await expect(
        contract.connect(buyer).transferTokens(1, receiver.address, 0)
      ).to.be.reverted;
    });

    it("Should reject transferring more tokens than owned", async function () {
      await expect(
        contract.connect(buyer).transferTokens(1, receiver.address, 5)
      ).to.be.reverted;
    });
  });

  describe("withdrawFunds", function () {
    beforeEach(async function () {
      await addDefaultProperty();

      const amount = 2;
      const totalCost = tokenPrice * BigInt(amount);

      await contract.connect(buyer).buyTokens(1, amount, {
        value: totalCost,
      });
    });

    it("Should show contract balance after token purchase", async function () {
      const expectedBalance = ethers.parseEther("0.02");
      expect(await contract.getContractBalance()).to.equal(expectedBalance);
    });

    it("Should allow owner to withdraw funds", async function () {
      await contract.withdrawFunds();

      expect(await contract.getContractBalance()).to.equal(0);
    });

    it("Should reject non-owner from withdrawing funds", async function () {
      await expect(
        contract.connect(outsider).withdrawFunds()
      ).to.be.reverted;
    });
  });
});