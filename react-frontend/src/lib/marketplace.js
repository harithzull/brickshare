import { ethers } from "ethers";

export const shortAddress = (address) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
export const formatEth = (value) => ethers.utils.formatEther(value);

export function positiveInteger(value, label = "Token amount") {
  if (!/^[1-9]\d*$/.test(String(value)))
    throw new Error(`${label} must be a positive whole number.`);
  const amount = ethers.BigNumber.from(value);
  if (amount.gt(ethers.constants.MaxUint256))
    throw new Error(`${label} is too large.`);
  return amount;
}

export function purchaseCost(property, quantity) {
  const amount = positiveInteger(quantity);
  if (property.sample) throw new Error("Sample listings cannot be purchased.");
  if (!property.active) throw new Error("This listing is inactive.");
  if (amount.gt(property.available))
    throw new Error("There are not enough tokens available.");
  const cost = property.priceWei.mul(amount);
  if (cost.gt(ethers.constants.MaxUint256))
    throw new Error("Purchase total is too large.");
  return cost;
}

export function percentage(amount, total) {
  const denominator = ethers.BigNumber.from(total);
  if (denominator.isZero()) return "0.00";
  // Use integer arithmetic for on-chain quantities; never convert token supplies to Number.
  const hundredths = ethers.BigNumber.from(amount).mul(10000).div(denominator);
  return `${hundredths.div(100).toString()}.${hundredths
    .mod(100)
    .toString()
    .padStart(2, "0")}`;
}

export function subscription(property) {
  return percentage(
    ethers.BigNumber.from(property.total).sub(property.available),
    property.total
  );
}

export function filterProperties(properties, search, location, status) {
  const query = search.trim().toLowerCase();
  return properties.filter((p) => {
    const state = !p.active
      ? "inactive"
      : p.available === "0"
      ? "sold-out"
      : "available";
    return (
      `${p.name} ${p.location}`.toLowerCase().includes(query) &&
      (!location || p.location === location) &&
      (!status || state === status)
    );
  });
}

export function safeContentUrl(value) {
  if (typeof value !== "string") return null;
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value))
    return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function prettyError(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED")
    return "You cancelled the request in your wallet.";
  const reason =
    error?.reason ||
    error?.error?.message ||
    error?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again.";
  if (/insufficient funds/i.test(reason))
    return "Your wallet needs more test ETH for this payment and gas.";
  if (/user rejected|user denied/i.test(reason))
    return "You cancelled the request in your wallet.";
  const match = reason.match(/reverted with reason string '([^']+)'/);
  return match ? match[1] : reason;
}

export async function readProperties(contract, account) {
  const count = (await contract.propertyCount()).toNumber();
  const results = [];
  // Bound concurrent RPC calls while still loading independent listings together.
  for (let start = 1; start <= count; start += 10) {
    const batch = await Promise.all(
      Array.from(
        { length: Math.min(10, count - start + 1) },
        async (_, index) => {
          const p = await contract.getProperty(start + index);
          const mine = account
            ? (await contract.getTokenBalance(p[0], account)).toString()
            : "0";
          return {
            id: p[0].toString(),
            name: p[1],
            location: p[2],
            total: p[3].toString(),
            available: p[4].toString(),
            priceWei: p[5],
            priceEth: formatEth(p[5]),
            active: p[6],
            mine,
            sample: false,
          };
        }
      )
    );
    results.push(...batch);
  }
  return results;
}

export async function readActivity(contract, account, fromBlock) {
  const latest = await contract.provider.getBlockNumber();
  const filters = [
    contract.filters.TokensPurchased(null, account),
    contract.filters.TokensTransferred(null, account, null),
    contract.filters.TokensTransferred(null, null, account),
  ];
  const events = new Map();
  for (let start = fromBlock; start <= latest; start += 2000) {
    const batches = await Promise.all(
      filters.map((filter) =>
        contract.queryFilter(filter, start, Math.min(start + 1999, latest))
      )
    );
    for (const event of batches.flat()) {
      events.set(`${event.transactionHash}:${event.logIndex}`, {
        key: `${event.transactionHash}:${event.logIndex}`,
        hash: event.transactionHash,
        block: event.blockNumber,
        logIndex: event.logIndex,
        propertyId: event.args.propertyId.toString(),
        amount: event.args.amount.toString(),
        type:
          event.event === "TokensPurchased"
            ? "Purchase"
            : event.args.from.toLowerCase() === account.toLowerCase()
            ? "Sent"
            : "Received",
        cost:
          event.event === "TokensPurchased"
            ? formatEth(event.args.totalCost)
            : null,
        counterparty:
          event.event === "TokensPurchased"
            ? null
            : event.args.from.toLowerCase() === account.toLowerCase()
            ? event.args.to
            : event.args.from,
      });
    }
  }
  return [...events.values()].sort(
    (a, b) => b.block - a.block || b.logIndex - a.logIndex
  );
}
