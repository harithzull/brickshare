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
  portfolioSummary,
} from "../src/lib/marketplace.js";
import { parseRoute, routeHref } from "../src/lib/navigation.js";

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

test("portfolio allocation uses exact listing-price references rather than mixing token supplies", () => {
  const expensive = {
    ...property,
    id: "2",
    name: "Other property",
    mine: "2",
    priceWei: ethers.utils.parseEther("0.03"),
  };
  const result = portfolioSummary([
    { ...property, mine: "2" },
    expensive,
    { ...property, id: "3", mine: "0" },
  ]);
  assert.equal(result.holdings.length, 2);
  assert.equal(result.tokens.toString(), "4");
  assert.equal(
    result.referenceWei.toString(),
    ethers.utils.parseEther("0.08").toString()
  );
  assert.deepEqual(
    result.allocation.map((item) => item.percentage),
    ["25.00", "75.00"]
  );
  assert.deepEqual(
    result.allocation.map((item) => item.weight),
    [25, 75]
  );
  assert.equal(portfolioSummary([]).referenceWei.toString(), "0");
});

test("portfolio aggregation retains precision with very large wallet balances", () => {
  const large = "100000000000000000001";
  const result = portfolioSummary([{ ...property, mine: large }]);
  assert.equal(result.tokens.toString(), large);
  assert.equal(
    result.referenceWei.toString(),
    property.priceWei.mul(large).toString()
  );
  assert.equal(result.allocation[0].weight, 100);
});

test("shareable navigation preserves sample isolation and handles malformed links", () => {
  assert.deepEqual(
    parseRoute(routeHref("property", { id: "sample-1", mode: "sample" })),
    { page: "property", id: "sample-1", mode: "sample" }
  );
  assert.deepEqual(parseRoute(routeHref("property", { id: "2" })), {
    page: "property",
    id: "2",
    mode: "live",
  });
  assert.deepEqual(parseRoute("#/portfolio?catalog=sample"), {
    page: "portfolio",
    mode: "live",
  });
  assert.deepEqual(parseRoute("#/property/%E0%A4"), {
    page: "home",
    mode: "live",
  });
  assert.deepEqual(parseRoute("#/unknown"), { page: "home", mode: "live" });
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
