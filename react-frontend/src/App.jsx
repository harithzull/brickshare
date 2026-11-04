import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  EXPECTED_CHAIN_ID,
  NETWORK_NAMES,
  RPC_URL,
} from "./config";
import useMarketplace from "./hooks/useMarketplace";
import { sampleProperties } from "./data/samples";
import {
  filterProperties,
  formatEth,
  percentage,
  positiveInteger,
  prettyError,
  purchaseCost,
  safeContentUrl,
  shortAddress,
  subscription,
} from "./lib/marketplace";
import PropertyCard from "./components/PropertyCard";
import PropertyArt from "./components/PropertyArt";
import "./App.css";

const networkName =
  NETWORK_NAMES[EXPECTED_CHAIN_ID] || `Chain ${EXPECTED_CHAIN_ID}`;

function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        ◇
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

function TransactionDialog({ quote, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="transaction-dialog"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      aria-labelledby="review-title"
    >
      <div className="dialog-heading">
        <span className="eyebrow">Transaction review</span>
        <button
          className="icon-button"
          aria-label="Close transaction review"
          onClick={onCancel}
        >
          ×
        </button>
      </div>
      <h2 id="review-title">{quote.title}</h2>
      <p>{quote.description}</p>
      <dl className="review-list">
        <div>
          <dt>Network</dt>
          <dd>{networkName}</dd>
        </div>
        <div>
          <dt>From wallet</dt>
          <dd title={quote.from}>{shortAddress(quote.from)}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>{formatEth(quote.value)} ETH</dd>
        </div>
        <div>
          <dt>Estimated network fee</dt>
          <dd>~{formatEth(quote.fee)} ETH</dd>
        </div>
        <div className="review-total">
          <dt>Estimated total</dt>
          <dd>{formatEth(quote.value.add(quote.fee))} ETH</dd>
        </div>
      </dl>
      <p className="small muted">
        Gas is an estimate with a 20% limit buffer. Your wallet shows the final
        fee before signing. This demo uses test funds.
      </p>
      <div className="button-row">
        <button className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" onClick={onConfirm}>
          Continue in wallet ↗
        </button>
      </div>
    </dialog>
  );
}

function PropertyDetails({
  property,
  account,
  disabled,
  onBack,
  onBuy,
  onConnect,
}) {
  const [amount, setAmount] = useState("1");
  const docs = (property.documents || []).filter(
    (document) =>
      typeof document.title === "string" && safeContentUrl(document.url)
  );
  let cost = null;
  let validation = "";
  try {
    cost = purchaseCost(property, amount);
  } catch (error) {
    validation = error.message;
  }
  const share = cost ? percentage(amount, property.total) : "0.00";
  return (
    <>
      <button className="text-button back-link" onClick={onBack}>
        ← Back to properties
      </button>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">
            {property.location} ·{" "}
            {property.sample ? "Fictional example" : `Property #${property.id}`}
          </p>
          <h1>{property.name}</h1>
        </div>
        <span className="badge available">
          {property.sample
            ? "Sample"
            : !property.active
            ? "Inactive"
            : property.available === "0"
            ? "Sold out"
            : "Available"}
        </span>
      </div>
      <div className="detail-grid">
        <div>
          <div className="detail-image">
            <PropertyArt property={property} />
          </div>
          <section className="panel detail-section">
            <h2>About this property</h2>
            <p>
              {property.description ||
                "This listing is recorded on the blockchain. The operator has not supplied an additional property description or authenticated photographs."}
            </p>
            <dl className="facts">
              <div>
                <dt>Total token supply</dt>
                <dd>{property.total}</dd>
              </div>
              <div>
                <dt>Available tokens</dt>
                <dd>{property.available}</dd>
              </div>
              <div>
                <dt>Supply subscribed</dt>
                <dd>{subscription(property)}%</dd>
              </div>
              <div>
                <dt>Your tokens</dt>
                <dd>
                  {property.sample
                    ? "Not applicable"
                    : account
                    ? property.mine
                    : "Connect to view"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="panel detail-section">
            <h2>Documents</h2>
            {docs.length ? (
              <ul className="document-list">
                {docs.map((document, index) => (
                  <li key={index}>
                    <a
                      href={safeContentUrl(document.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {document.title} <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No supporting documents have been published for this listing.
              </p>
            )}
            {docs.length > 0 && (
              <p className="small muted">
                {property.sample
                  ? "Sample documents are fictional."
                  : "Operator-supplied documents have not been independently verified by BrickShare."}
              </p>
            )}
          </section>
          <section className="panel detail-section">
            <h2>How this demo works</h2>
            <p>
              Purchases send test ETH to the contract. The administrator can
              withdraw the proceeds. Tokens record an application balance; they
              do not transfer legal title. There are no refunds, rental
              payments, or guaranteed returns in this version.
            </p>
          </section>
        </div>
        <aside className="panel purchase-panel">
          <p className="eyebrow">Price per token</p>
          <div className="detail-price">
            {property.priceEth} <span>ETH</span>
          </div>
          <p className="muted small">
            {property.sample
              ? "Illustrative price · no transaction available"
              : "Test ETH · network fees apply"}
          </p>
          <div className="progress-label">
            <span>Supply subscribed</span>
            <strong>{subscription(property)}%</strong>
          </div>
          <progress
            max="100"
            value={subscription(property)}
            aria-label="Supply subscribed"
          />
          {property.sample ? (
            <div className="notice">
              This fictional listing is for browsing only. Switch to live
              listings to interact with a deployed contract.
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (cost) onBuy(property, amount);
              }}
            >
              <label htmlFor="buy-quantity">Number of tokens</label>
              <input
                id="buy-quantity"
                type="text"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-describedby="buy-validation"
                required
              />
              <div className="purchase-summary">
                <div>
                  <span>Token payment</span>
                  <strong>{cost ? `${formatEth(cost)} ETH` : "—"}</strong>
                </div>
                <div>
                  <span>Share represented</span>
                  <strong>{share}%</strong>
                </div>
              </div>
              <p className="small muted">
                The next step estimates gas and lets you review before signing.
              </p>
              {validation && (
                <p id="buy-validation" className="field-error">
                  {validation}
                </p>
              )}
              {account ? (
                <button
                  className="button primary full-width"
                  disabled={disabled || !cost}
                >
                  Review purchase ↗
                </button>
              ) : (
                <button
                  className="button primary full-width"
                  type="button"
                  disabled={!cost || disabled}
                  onClick={onConnect}
                >
                  Connect wallet to buy
                </button>
              )}
            </form>
          )}
        </aside>
      </div>
    </>
  );
}

function Portfolio({ account, market, busy, onConnect, onSelect, onTransfer }) {
  const [transfer, setTransfer] = useState({ id: "", to: "", amount: "" });
  if (!account)
    return (
      <EmptyState
        title="Your property portfolio starts here"
        action={
          <button className="button primary" onClick={onConnect}>
            Connect wallet ↗
          </button>
        }
      >
        Connect a wallet to see your live token holdings and on-chain
        transaction history. Browsing properties is always available without
        connecting.
      </EmptyState>
    );
  if (market.status !== "ready" || market.refreshing)
    return (
      <EmptyState
        title={
          market.refreshing
            ? "Loading your portfolio…"
            : "Portfolio unavailable"
        }
      >
        {market.refreshing
          ? "Reading balances and activity from the blockchain."
          : "Restore the property network connection and refresh to see your holdings."}
      </EmptyState>
    );
  const holdings = market.properties.filter(
    (property) => property.mine !== "0"
  );
  const tokens = holdings.reduce(
    (sum, p) => sum.add(p.mine),
    ethers.constants.Zero
  );
  const referenceValue = holdings.reduce(
    (sum, p) => sum.add(p.priceWei.mul(p.mine)),
    ethers.constants.Zero
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Investor dashboard</p>
          <h1>Your portfolio</h1>
          <p className="muted">
            Holdings for <span title={account}>{shortAddress(account)}</span>
          </p>
        </div>
        <button className="button secondary" onClick={market.refresh}>
          Refresh balances ↻
        </button>
      </div>
      <div className="stats-grid">
        <div className="stat-box">
          <span>Properties held</span>
          <strong>{holdings.length}</strong>
        </div>
        <div className="stat-box">
          <span>Total tokens</span>
          <strong>{tokens.toString()}</strong>
        </div>
        <div className="stat-box">
          <span>Value at listing prices</span>
          <strong>
            {formatEth(referenceValue)} <small>ETH</small>
          </strong>
          <p>Reference only; not resale value or purchase cost.</p>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Your holdings</h2>
          <span className="muted small">Live contract balances</span>
        </div>
        {!holdings.length ? (
          <EmptyState title="No tokens held yet">
            Browse live listings to find your first property, or receive tokens
            from another wallet.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Your property token holdings
              </caption>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Tokens</th>
                  <th>Share</th>
                  <th>Listing price</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <span className="table-sub">{p.location}</span>
                    </td>
                    <td>{p.mine}</td>
                    <td>{percentage(p.mine, p.total)}%</td>
                    <td>{p.priceEth} ETH</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onSelect(p.id)}
                      >
                        View ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="portfolio-grid">
        <section className="panel">
          <h2>Transfer tokens</h2>
          <p className="muted small">
            Send your existing tokens. No sale payment is collected; you pay
            gas.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onTransfer(transfer, () =>
                setTransfer({ id: "", to: "", amount: "" })
              );
            }}
          >
            <label htmlFor="transfer-property">Property</label>
            <select
              id="transfer-property"
              value={transfer.id}
              onChange={(event) =>
                setTransfer({ ...transfer, id: event.target.value })
              }
              required
            >
              <option value="">Choose a holding</option>
              {holdings.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.mine} tokens)
                </option>
              ))}
            </select>
            <label htmlFor="transfer-recipient">Recipient wallet address</label>
            <input
              id="transfer-recipient"
              placeholder="0x…"
              value={transfer.to}
              onChange={(event) =>
                setTransfer({ ...transfer, to: event.target.value })
              }
              required
            />
            <label htmlFor="transfer-amount">Number of tokens</label>
            <input
              id="transfer-amount"
              inputMode="numeric"
              pattern="[1-9][0-9]*"
              value={transfer.amount}
              onChange={(event) =>
                setTransfer({ ...transfer, amount: event.target.value })
              }
              required
            />
            <button
              className="button primary full-width"
              disabled={busy || !holdings.length}
            >
              Review transfer ↗
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Activity</h2>
          <p className="muted small">
            Confirmed purchases and transfers for this wallet.
          </p>
          {market.activityError ? (
            <p className="field-error" role="alert">
              {market.activityError}
            </p>
          ) : !market.activity.length ? (
            <p className="muted">No activity found for this deployment.</p>
          ) : (
            <ul className="activity-list">
              {market.activity.map((event) => (
                <li key={event.key}>
                  <span className="activity-icon" aria-hidden="true">
                    {event.type === "Sent" ? "↗" : "↙"}
                  </span>
                  <div>
                    <strong>
                      {event.type} · {event.amount} tokens
                    </strong>
                    <span>
                      {market.properties.find((p) => p.id === event.propertyId)
                        ?.name || `Property #${event.propertyId}`}
                      {event.cost
                        ? ` · ${event.cost} ETH`
                        : ` · ${shortAddress(event.counterparty)}`}
                    </span>
                    <details>
                      <summary>Block {event.block} · transaction</summary>
                      <code>{event.hash}</code>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Admin({
  isOwner,
  account,
  market,
  busy,
  onConnect,
  onAdd,
  onWithdraw,
}) {
  const [form, setForm] = useState({
    name: "",
    location: "",
    total: "",
    price: "",
  });
  if (!account)
    return (
      <EmptyState
        title="Administrator workspace"
        action={
          <button className="button primary" onClick={onConnect}>
            Connect wallet ↗
          </button>
        }
      >
        Connect the deployment wallet to add properties and manage collected
        funds.
      </EmptyState>
    );
  if (!isOwner || market.status !== "ready" || market.refreshing)
    return (
      <EmptyState title="Administrator access required">
        Only the wallet that deployed this contract can add properties and
        withdraw funds. Restore the network connection if it is unavailable.
      </EmptyState>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Manage your listings</h1>
          <p className="muted">
            Changes are recorded on-chain after your wallet confirms.
          </p>
        </div>
      </div>
      <div className="admin-grid">
        <section className="panel">
          <h2>Add a property</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onAdd(form, () =>
                setForm({ name: "", location: "", total: "", price: "" })
              );
            }}
          >
            <label htmlFor="add-name">Property name</label>
            <input
              id="add-name"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              maxLength="160"
              required
            />
            <label htmlFor="add-location">Location</label>
            <input
              id="add-location"
              value={form.location}
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
              maxLength="160"
              required
            />
            <div className="form-columns">
              <div>
                <label htmlFor="add-total">Total tokens</label>
                <input
                  id="add-total"
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  value={form.total}
                  onChange={(event) =>
                    setForm({ ...form, total: event.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label htmlFor="add-price">Price per token (ETH)</label>
                <input
                  id="add-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) =>
                    setForm({ ...form, price: event.target.value })
                  }
                  required
                />
              </div>
            </div>
            <button className="button primary full-width" disabled={busy}>
              Review new listing ↗
            </button>
          </form>
        </section>
        <section className="panel treasury">
          <p className="eyebrow">Contract treasury</p>
          <h2>
            {formatEth(market.balance)} <span>ETH</span>
          </h2>
          <p className="muted">
            Collected token purchase funds. Withdrawing sends the entire balance
            to the administrator wallet.
          </p>
          <button
            className="button primary"
            onClick={onWithdraw}
            disabled={busy || market.balance === "0"}
          >
            Review withdrawal ↗
          </button>
          <p className="small muted">
            Listing prices and supplies cannot be edited after creation in this
            version.
          </p>
        </section>
      </div>
    </>
  );
}

export default function App() {
  const [view, setView] = useState("marketplace");
  const [mode, setMode] = useState("live");
  const [selectedId, setSelectedId] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [walletChain, setWalletChain] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tx, setTx] = useState(null);
  const [quote, setQuote] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const lock = useRef(false);
  const walletSession = useRef(0);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const market = useMarketplace(wallet?.account || null);
  const isOwner =
    !!wallet && market.owner?.toLowerCase() === wallet.account.toLowerCase();
  const busy =
    connecting ||
    estimating ||
    tx?.status === "awaiting" ||
    tx?.status === "pending";
  const catalog = mode === "sample" ? sampleProperties : market.properties;
  const properties = useMemo(
    () => filterProperties(catalog, search, location, status),
    [catalog, search, location, status]
  );
  const selected = catalog.find((property) => property.id === selectedId);

  useEffect(() => {
    if (!selectedId && view === "marketplace") return;
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [view, selectedId]);

  const navigate = (next) => {
    setView(next);
    setSelectedId(null);
    if (next !== "marketplace") setMode("live");
  };
  const changeMode = (next) => {
    setMode(next);
    setSelectedId(null);
    setSearch("");
    setLocation("");
    setStatus("");
  };

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const reset = () => {
      walletSession.current++;
      setWallet(null);
      setQuote(null);
      setWalletChain(null);
      setNotice(
        "Wallet account or network changed. Reconnect to load the selected wallet."
      );
    };
    window.ethereum.on("accountsChanged", reset);
    window.ethereum.on("chainChanged", reset);
    return () => {
      window.ethereum.removeListener("accountsChanged", reset);
      window.ethereum.removeListener("chainChanged", reset);
    };
  }, []);

  const connect = async () => {
    if (!window.ethereum) {
      setNotice(
        "Install MetaMask or another compatible browser wallet to transact. You can still browse properties without it."
      );
      return;
    }
    setConnecting(true);
    try {
      const provider = new ethers.providers.Web3Provider(
        window.ethereum,
        "any"
      );
      const accounts = await provider.send("eth_requestAccounts", []);
      const { chainId } = await provider.getNetwork();
      setWalletChain(chainId);
      if (chainId !== EXPECTED_CHAIN_ID)
        throw new Error(
          `Your wallet is on chain ${chainId}. Switch to ${networkName} to continue.`
        );
      if (!accounts.length) throw new Error("No wallet account was selected.");
      setWallet({
        account: ethers.utils.getAddress(accounts[0]),
        provider,
        signer: provider.getSigner(accounts[0]),
      });
      setNotice(null);
    } catch (error) {
      setNotice(prettyError(error));
    } finally {
      setConnecting(false);
    }
  };

  const switchNetwork = async () => {
    try {
      if (!window.ethereum)
        throw new Error("Install a browser wallet to switch networks.");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ethers.utils.hexValue(EXPECTED_CHAIN_ID) }],
        });
      } catch (error) {
        if (error.code !== 4902 || EXPECTED_CHAIN_ID !== 31337) throw error;
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x7a69",
              chainName: "Hardhat Local",
              rpcUrls: [RPC_URL],
              nativeCurrency: {
                name: "Test Ether",
                symbol: "ETH",
                decimals: 18,
              },
            },
          ],
        });
      }
      setNotice("Network selected. Connect your wallet to continue.");
      setWalletChain(null);
    } catch (error) {
      setNotice(prettyError(error));
    }
  };

  const review = async (title, description, build, onDone) => {
    if (lock.current) return;
    if (!wallet) {
      await connect();
      return;
    }
    if (mode === "sample" || market.status !== "ready" || market.refreshing) {
      setNotice(
        "Live blockchain data must be available before preparing a transaction."
      );
      return;
    }
    lock.current = true;
    const session = walletSession.current;
    setEstimating(true);
    setNotice(null);
    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        wallet.signer
      );
      const request = await build(contract);
      const [estimatedGas, fees, from, network] = await Promise.all([
        wallet.signer.estimateGas(request),
        wallet.provider.getFeeData(),
        wallet.signer.getAddress(),
        wallet.provider.getNetwork(),
      ]);
      if (
        network.chainId !== EXPECTED_CHAIN_ID ||
        from.toLowerCase() !== wallet.account.toLowerCase()
      )
        throw new Error("Wallet changed. Reconnect and try again.");
      const gasLimit = estimatedGas.mul(120).add(99).div(100);
      const feeRate = fees.maxFeePerGas || fees.gasPrice;
      if (!feeRate)
        throw new Error(
          "The network could not provide a fee estimate. Please retry."
        );
      const value = ethers.BigNumber.from(request.value || 0);
      const fee = gasLimit.mul(feeRate);
      if ((await wallet.signer.getBalance()).lt(value.add(fee)))
        throw new Error(
          "Your wallet needs more test ETH for the payment and estimated gas."
        );
      if (session !== walletSession.current)
        throw new Error(
          "Wallet changed. Reconnect and review the transaction again."
        );
      setQuote({
        title,
        description,
        request: { ...request, gasLimit },
        value,
        fee,
        from,
        onDone,
      });
    } catch (error) {
      setNotice(prettyError(error));
    } finally {
      setEstimating(false);
      lock.current = false;
    }
  };

  const confirm = async () => {
    if (lock.current || !quote || !wallet) return;
    lock.current = true;
    const current = quote;
    setQuote(null);
    setTx({
      status: "awaiting",
      title: current.title,
      message: "Confirm this transaction in your wallet.",
    });
    try {
      const chainId = await wallet.provider.send("eth_chainId", []);
      const accounts = await wallet.provider.send("eth_accounts", []);
      if (
        Number(chainId) !== EXPECTED_CHAIN_ID ||
        accounts[0]?.toLowerCase() !== current.from.toLowerCase()
      )
        throw new Error(
          "Wallet changed. Reconnect and review the transaction again."
        );
      const sent = await wallet.signer.sendTransaction(current.request);
      setTx({
        status: "pending",
        title: current.title,
        message: "Waiting for blockchain confirmation…",
        hash: sent.hash,
      });
      let receipt;
      try {
        receipt = await sent.wait();
      } catch (error) {
        if (error.code === "TRANSACTION_REPLACED" && !error.cancelled)
          receipt = error.receipt;
        else throw error;
      }
      if (receipt.status !== 1)
        throw new Error("The transaction was not successful.");
      setTx({
        status: "success",
        title: `${current.title} confirmed`,
        message: "Your transaction is recorded on-chain.",
        hash: receipt.transactionHash,
      });
      current.onDone?.();
      await market.refresh();
    } catch (error) {
      setTx({
        status: "error",
        title: `${current.title} failed`,
        message: prettyError(error),
      });
    } finally {
      lock.current = false;
    }
  };

  const buy = (property, amount) =>
    review(
      "Buy property tokens",
      `${amount} tokens of ${property.name}.`,
      async (contract) => {
        const value = purchaseCost(property, amount);
        return contract.populateTransaction.buyTokens(property.id, amount, {
          value,
        });
      }
    );
  const transfer = (form, onDone) =>
    review(
      "Transfer property tokens",
      `Send ${form.amount} tokens to ${shortAddress(form.to)}.`,
      async (contract) => {
        const property = market.properties.find((p) => p.id === form.id);
        const amount = positiveInteger(form.amount);
        if (!property || amount.gt(property.mine))
          throw new Error("You do not own enough tokens for this transfer.");
        if (!ethers.utils.isAddress(form.to.trim()))
          throw new Error("Enter a valid recipient wallet address.");
        const recipient = ethers.utils.getAddress(form.to.trim());
        if (recipient === ethers.constants.AddressZero)
          throw new Error("Recipient cannot be the zero address.");
        return contract.populateTransaction.transferTokens(
          form.id,
          recipient,
          amount
        );
      },
      onDone
    );
  const add = (form, onDone) =>
    review(
      "Add property",
      `Create ${form.name.trim()} in ${form.location.trim()}.`,
      async (contract) => {
        if (!isOwner)
          throw new Error("Only the administrator can add properties.");
        if (!form.name.trim() || !form.location.trim())
          throw new Error("Enter a name and location.");
        const total = positiveInteger(form.total, "Total supply");
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(form.price.trim()))
          throw new Error("Enter an ETH price with up to 18 decimal places.");
        const price = ethers.utils.parseEther(form.price.trim());
        if (price.lte(0))
          throw new Error("Token price must be greater than zero.");
        if (price.gt(ethers.constants.MaxUint256))
          throw new Error("Token price is too large.");
        return contract.populateTransaction.addProperty(
          form.name.trim(),
          form.location.trim(),
          total,
          price
        );
      },
      onDone
    );
  const withdraw = () =>
    review(
      "Withdraw collected funds",
      `Send the entire contract balance to ${shortAddress(wallet?.account)}.`,
      async (contract) => {
        if (!isOwner)
          throw new Error("Only the administrator can withdraw funds.");
        return contract.populateTransaction.withdrawFunds();
      }
    );

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="demo-strip">
        <span>Built for exploration.</span> Local blockchain demo · test ETH
        only
      </div>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="brand"
            onClick={() => navigate("marketplace")}
            aria-label="BrickShare home"
          >
            <span className="brand-mark" aria-hidden="true">
              ▥
            </span>
            BrickShare<span className="brand-dot">.</span>
          </button>
          <nav aria-label="Main navigation">
            <button
              aria-current={view === "marketplace" ? "page" : undefined}
              onClick={() => navigate("marketplace")}
            >
              Marketplace
            </button>
            <button
              aria-current={view === "portfolio" ? "page" : undefined}
              onClick={() => navigate("portfolio")}
            >
              My portfolio
            </button>
            <button
              aria-current={view === "admin" ? "page" : undefined}
              onClick={() => navigate("admin")}
            >
              Administration
            </button>
          </nav>
          <div className="wallet-actions">
            <span className="network-label">
              <i />
              {networkName}
            </span>
            {wallet ? (
              <button
                className="button secondary wallet-button"
                onClick={() => {
                  setWallet(null);
                  setQuote(null);
                  setNotice(null);
                }}
                title={`${wallet.account} · disconnect from this app`}
                disabled={busy}
              >
                {isOwner ? "Admin · " : ""}
                {shortAddress(wallet.account)} <span aria-hidden="true">×</span>
              </button>
            ) : (
              <button
                className="button primary"
                onClick={connect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect wallet ↗"}
              </button>
            )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex="-1">
        {notice && (
          <div className="notice notification" role="alert">
            <span>{notice}</span>
            <div>
              {walletChain && walletChain !== EXPECTED_CHAIN_ID ? (
                <button className="button secondary" onClick={switchNetwork}>
                  Switch network
                </button>
              ) : null}
              <button
                className="icon-button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        )}
        {estimating && (
          <div className="notice" role="status">
            Preparing your transaction and estimating network fees…
          </div>
        )}
        {view === "marketplace" && (
          <>
            {selected ? (
              <PropertyDetails
                key={selected.id}
                property={selected}
                account={wallet?.account}
                disabled={
                  busy || market.status !== "ready" || market.refreshing
                }
                onBack={() => setSelectedId(null)}
                onBuy={buy}
                onConnect={connect}
              />
            ) : (
              <>
                <section className="hero">
                  <div>
                    <p className="eyebrow">A new perspective on property</p>
                    <h1>
                      Explore property.
                      <br />
                      <em>One fraction at a time.</em>
                    </h1>
                    <p className="hero-description">
                      Discover listings, understand the numbers, and explore
                      fractional ownership on a local blockchain. Start
                      browsing. Connect when you’re ready.
                    </p>
                    <div className="hero-actions">
                      <a className="button primary" href="#listings">
                        Explore properties <span aria-hidden="true">↓</span>
                      </a>
                      <button
                        className="text-button"
                        onClick={() => navigate("portfolio")}
                      >
                        View your portfolio ↗
                      </button>
                    </div>
                  </div>
                  <div className="hero-note">
                    <span className="hero-symbol" aria-hidden="true">
                      ▥
                    </span>
                    <p>
                      Property, with
                      <br />a clearer view.
                    </p>
                    <span>
                      Transparent supply. Visible balances.
                      <br />
                      Every transaction on-chain.
                    </span>
                  </div>
                </section>
                <section id="listings" className="market-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">The collection</p>
                      <h2>Find your next perspective</h2>
                    </div>
                    <div className="catalog-controls">
                      <div className="segmented" aria-label="Catalog source">
                        <button
                          aria-pressed={mode === "live"}
                          onClick={() => changeMode("live")}
                        >
                          Live listings
                        </button>
                        <button
                          aria-pressed={mode === "sample"}
                          onClick={() => changeMode("sample")}
                        >
                          Sample preview
                        </button>
                      </div>
                      {mode === "live" && (
                        <button
                          className="button secondary"
                          onClick={market.refresh}
                          disabled={market.refreshing}
                        >
                          {market.refreshing ? "Refreshing…" : "Refresh ↻"}
                        </button>
                      )}
                    </div>
                  </div>
                  {mode === "sample" && (
                    <div className="notice sample-notice">
                      <strong>Fictional sample catalog.</strong> All properties,
                      images, prices, and subscription figures here are
                      illustrative. Purchases and transfers are disabled.
                    </div>
                  )}
                  <div className="filter-bar">
                    <div className="search-field">
                      <label htmlFor="property-search">Search properties</label>
                      <input
                        id="property-search"
                        type="search"
                        placeholder="Search by name or location…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="location-filter">Location</label>
                      <select
                        id="location-filter"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                      >
                        <option value="">All locations</option>
                        {[...new Set(catalog.map((p) => p.location))]
                          .sort()
                          .map((loc) => (
                            <option key={loc}>{loc}</option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="status-filter">Availability</label>
                      <select
                        id="status-filter"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                      >
                        <option value="">All listings</option>
                        <option value="available">Available</option>
                        <option value="sold-out">Sold out</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  {mode === "live" && market.status === "loading" ? (
                    <div
                      className="property-grid"
                      role="status"
                      aria-label="Loading properties"
                    >
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="skeleton-card">
                          <div />
                          <span />
                          <span />
                          <span />
                        </div>
                      ))}
                      <span className="sr-only">Loading properties…</span>
                    </div>
                  ) : mode === "live" &&
                    ["unconfigured", "error"].includes(market.status) ? (
                    <EmptyState
                      title={
                        market.status === "error"
                          ? "We couldn’t reach the property network"
                          : "Your live marketplace is ready to set up"
                      }
                      action={
                        <div className="button-row">
                          <button
                            className="button primary"
                            onClick={() => changeMode("sample")}
                          >
                            Explore the sample catalog
                          </button>
                          {market.status === "error" && (
                            <button
                              className="button secondary"
                              onClick={market.refresh}
                              disabled={market.refreshing}
                            >
                              Retry connection
                            </button>
                          )}
                        </div>
                      }
                    >
                      {market.error ||
                        "No contract is configured yet. You can explore fictional examples while your local deployment is being prepared."}
                    </EmptyState>
                  ) : !catalog.length ? (
                    <EmptyState
                      title="A fresh start for your marketplace"
                      action={
                        <button
                          className="button secondary"
                          onClick={() => navigate("admin")}
                        >
                          Open administration ↗
                        </button>
                      }
                    >
                      There are no properties on this contract yet. The
                      administrator can add the first listing.
                    </EmptyState>
                  ) : (
                    <>
                      <p className="result-count" role="status">
                        {properties.length}{" "}
                        {properties.length === 1 ? "property" : "properties"}
                        {mode === "sample"
                          ? " in sample preview"
                          : " on this contract"}
                      </p>
                      {properties.length ? (
                        <div className="property-grid">
                          {properties.map((property) => (
                            <PropertyCard
                              key={property.id}
                              property={property}
                              onSelect={setSelectedId}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="No properties match your search"
                          action={
                            <button
                              className="button secondary"
                              onClick={() => {
                                setSearch("");
                                setLocation("");
                                setStatus("");
                              }}
                            >
                              Clear filters
                            </button>
                          }
                        >
                          Try another location, name, or availability filter.
                        </EmptyState>
                      )}
                    </>
                  )}
                </section>
                <section className="how-it-works">
                  <div>
                    <p className="eyebrow">Simple by design</p>
                    <h2>
                      From discovery
                      <br />
                      to your dashboard.
                    </h2>
                  </div>
                  <ol>
                    <li>
                      <span>01</span>
                      <div>
                        <h3>Explore the details</h3>
                        <p>
                          Browse prices, supply, and documents without
                          connecting a wallet.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <h3>Review, then confirm</h3>
                        <p>
                          See your test ETH payment and a gas estimate before
                          signing.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <h3>Keep a clear record</h3>
                        <p>
                          Track your holdings and confirmed transfers in one
                          place.
                        </p>
                      </div>
                    </li>
                  </ol>
                </section>
              </>
            )}
          </>
        )}
        {view === "portfolio" && (
          <Portfolio
            account={wallet?.account}
            market={market}
            busy={busy}
            onConnect={connect}
            onSelect={(id) => {
              setView("marketplace");
              setMode("live");
              setSelectedId(id);
            }}
            onTransfer={transfer}
          />
        )}
        {view === "admin" && (
          <Admin
            account={wallet?.account}
            isOwner={isOwner}
            market={market}
            busy={busy}
            onConnect={connect}
            onAdd={add}
            onWithdraw={withdraw}
          />
        )}
      </main>
      <footer>
        <div>
          <strong>BrickShare.</strong>
          <span>A clearer view of fractional property.</span>
        </div>
        <p>
          Development demo · No real property rights or financial returns are
          offered.
          <br />
          Architectural illustrations are placeholders, not property
          photographs.
        </p>
      </footer>
      {tx && (
        <div
          className={`transaction-status ${tx.status}`}
          role={tx.status === "error" ? "alert" : "status"}
        >
          <div>
            <span className="status-dot" />
            <strong>{tx.title}</strong>
            {!["awaiting", "pending"].includes(tx.status) && (
              <button
                className="icon-button"
                onClick={() => setTx(null)}
                aria-label="Dismiss transaction status"
              >
                ×
              </button>
            )}
          </div>
          <p>{tx.message}</p>
          {tx.hash && (
            <details>
              <summary>Transaction hash</summary>
              <code>{tx.hash}</code>
            </details>
          )}
        </div>
      )}
      {quote && (
        <TransactionDialog
          quote={quote}
          onCancel={() => setQuote(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
