import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  filterProperties,
  percentage,
  positiveInteger,
  purchaseCost,
  readActivity,
  readProperties,
  safeContentUrl,
  subscription,
} from "../src/lib/marketplace.js";

const property = {
  id: "1",
  name: "Cyberjaya Condo",
  location: "Cyberjaya",
  total: "1000",
  available: "990",
  priceWei: ethers.utils.parseEther("0.01"),
  active: true,
};

test("purchase totals retain wei precision and reject invalid or unavailable quantities", () => {
  assert.equal(purchaseCost(property, "3").toString(), "30000000000000000");
  for (const quantity of ["0", "-1", "1.5", "1e3", " 2", "abc", "1001"])
    assert.throws(() => purchaseCost(property, quantity));
  assert.throws(
    () => purchaseCost({ ...property, sample: true }, "1"),
    /Sample/
  );
  assert.throws(
    () => purchaseCost({ ...property, active: false }, "1"),
    /inactive/
  );
  assert.throws(
    () => positiveInteger(ethers.constants.MaxUint256.add(1).toString()),
    /too large/
  );
});

test("ownership and subscription percentages support supplies above Number.MAX_SAFE_INTEGER", () => {
  assert.equal(
    percentage("100000000000000000000", "300000000000000000000"),
    "33.33"
  );
  assert.equal(subscription(property), "1.00");
  assert.equal(percentage("0", "1000"), "0.00");
  assert.equal(percentage("1000", "1000"), "100.00");
});

test("search combines location and true listing availability", () => {
  const sold = {
    ...property,
    id: "2",
    name: "Penang House",
    location: "Penang",
    available: "0",
  };
  const inactive = { ...property, id: "3", active: false };
  assert.deepEqual(
    filterProperties(
      [property, sold, inactive],
      " CYBER ",
      "Cyberjaya",
      "available"
    ),
    [property]
  );
  assert.deepEqual(
    filterProperties([property, sold, inactive], "", "", "sold-out"),
    [sold]
  );
  assert.deepEqual(
    filterProperties([property, sold, inactive], "", "", "inactive"),
    [inactive]
  );
});

test("document and image URLs reject executable or credential-bearing content", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "//example.com",
    "http://example.com",
    "https://user:secret@example.com",
    "/\\example.com",
    "/ example",
    null,
  ])
    assert.equal(safeContentUrl(url), null);
  assert.equal(
    safeContentUrl("/samples/property-overview.md"),
    "/samples/property-overview.md"
  );
  assert.equal(
    safeContentUrl("https://example.com/property.pdf"),
    "https://example.com/property.pdf"
  );
});

test("public property browsing performs no wallet balance reads", async () => {
  const contract = {
    propertyCount: async () => ethers.BigNumber.from(1),
    getProperty: async () => [
      ethers.BigNumber.from(1),
      property.name,
      property.location,
      ethers.BigNumber.from(1000),
      ethers.BigNumber.from(990),
      property.priceWei,
      true,
    ],
    getTokenBalance: async () => {
      throw new Error("Public browsing must not read a wallet");
    },
  };
  const [result] = await readProperties(contract, null);
  assert.equal(result.name, property.name);
  assert.equal(result.mine, "0");
  contract.getTokenBalance = async () => ethers.BigNumber.from(10);
  assert.equal((await readProperties(contract, "0xbuyer"))[0].mine, "10");
});

test("wallet activity is paginated, ordered and deduplicates self transfers", async () => {
  const account = "0xbuyer";
  const purchase = {
    transactionHash: "0xbuy",
    logIndex: 0,
    blockNumber: 1,
    event: "TokensPurchased",
    args: {
      propertyId: 1,
      amount: 10,
      totalCost: ethers.utils.parseEther("0.1"),
    },
  };
  const selfTransfer = {
    transactionHash: "0xself",
    logIndex: 1,
    blockNumber: 2001,
    event: "TokensTransferred",
    args: { propertyId: 1, amount: 2, from: account, to: account },
  };
  const ranges = [];
  const contract = {
    provider: { getBlockNumber: async () => 2001 },
    filters: {
      TokensPurchased: () => "purchase",
      TokensTransferred: (_id, from) => (from ? "outgoing" : "incoming"),
    },
    queryFilter: async (filter, start, end) => {
      ranges.push([start, end]);
      if (filter === "purchase") return start === 1 ? [purchase] : [];
      return start === 2001 ? [selfTransfer] : [];
    },
  };
  const activity = await readActivity(contract, account, 1);
  assert.equal(activity.length, 2);
  assert.equal(activity[0].hash, "0xself");
  assert.equal(activity[1].cost, "0.1");
  assert.deepEqual(
    [...new Set(ranges.map(JSON.stringify))],
    ["[1,2000]", "[2001,2001]"]
  );
});
