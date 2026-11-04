import { useState } from "react";
import { formatEth, shortAddress } from "../lib/marketplace";
import Icon from "../components/Icon";
import CreatePropertyForm from "../components/CreatePropertyForm";
import {
  Button,
  EmptyState,
  LoadingSkeleton,
  Notice,
  PageHeader,
  PropertyStatusBadge,
  StatCard,
} from "../components/ui";

function Treasury({ balance, busy, onWithdraw }) {
  return (
    <section className="panel treasury-panel">
      <p className="eyebrow">CONTRACT TREASURY</p>
      <div className="treasury-amount">
        {formatEth(balance)}
        <span>ETH</span>
      </div>
      <p>Collected test ETH from token purchases on this contract.</p>
      <div className="treasury-destination">
        <Icon name="wallet" size={18} />
        <span>Funds go to the deployment wallet.</span>
      </div>
      <div className="sensitive-section">
        <h3>Withdraw collected funds</h3>
        <p>
          This sends the entire available balance to the administrator. Review
          the destination and network fee before signing.
        </p>
        <Button
          variant="danger-outline"
          onClick={onWithdraw}
          disabled={busy || balance === "0"}
          icon="arrowUpRight"
        >
          Review withdrawal
        </Button>
        {balance === "0" && (
          <p className="input-help">
            There are no funds available to withdraw.
          </p>
        )}
      </div>
    </section>
  );
}

function ListingsTable({ properties, busy, onStatus }) {
  return (
    <section className="panel admin-listings">
      <div className="section-title">
        <div>
          <h2>Property listings</h2>
          <p>Manage purchase availability for your collection.</p>
        </div>
        <span className="badge neutral">{properties.length} listings</span>
      </div>
      {properties.length ? (
        <div
          className="table-scroll"
          tabIndex="0"
          aria-label="Property management table"
        >
          <table>
            <caption className="sr-only">
              Property listings with token supplies, prices, and status actions
            </caption>
            <thead>
              <tr>
                <th>Property</th>
                <th>Price / token</th>
                <th>Available / total</th>
                <th>Status</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => (
                <tr key={property.id}>
                  <td>
                    <div className="table-property">
                      <span className="table-property-icon">
                        <Icon name="building" />
                      </span>
                      <div>
                        <strong>{property.name}</strong>
                        <span>
                          {property.location} · #{property.id}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{property.priceEth} ETH</td>
                  <td>
                    {property.available}{" "}
                    <span className="muted">/ {property.total}</span>
                  </td>
                  <td>
                    <PropertyStatusBadge property={property} />
                  </td>
                  <td>
                    <button
                      className={`table-action ${
                        property.active ? "deactivate" : "activate"
                      }`}
                      disabled={busy}
                      onClick={() => onStatus(property)}
                      aria-label={`${
                        property.active ? "Deactivate" : "Activate"
                      } ${property.name}`}
                    >
                      {property.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          compact
          icon="building"
          title="Your collection is a blank canvas."
        >
          Create your first listing to get started.
        </EmptyState>
      )}
      <p className="table-footnote">
        <Icon name="info" size={15} />
        Deactivation stops new purchases. Existing holders can still transfer
        their tokens.
      </p>
    </section>
  );
}

export default function AdminPage({ app }) {
  const [section, setSection] = useState("overview");
  const { wallet, market, isOwner, busy } = app;
  const sections = [
    ["overview", "Overview", "grid"],
    ["listings", "Property listings", "building"],
    ["create", "Create property", "plus"],
    ["treasury", "Treasury", "wallet"],
  ];
  const active = market.properties.filter((p) => p.active).length;
  if (!wallet)
    return (
      <div className="page">
        <PageHeader
          eyebrow="THE OPERATOR WORKSPACE"
          title="Administration."
          description="A focused place to manage your property collection."
        />
        <EmptyState
          icon="lock"
          title="The right wallet opens the right doors."
          action={
            <Button
              onClick={app.connect}
              disabled={app.connecting}
              icon="wallet"
            >
              Connect administrator wallet
            </Button>
          }
        >
          Connect the wallet that deployed the contract to create properties,
          manage purchase availability, and review collected funds.
        </EmptyState>
      </div>
    );
  if (market.refreshing || market.status === "loading")
    return (
      <div className="page">
        <PageHeader eyebrow="ADMINISTRATION" title="Loading your workspace…" />
        <LoadingSkeleton variant="stats" />
      </div>
    );
  if (market.status !== "ready")
    return (
      <div className="page">
        <PageHeader
          eyebrow="ADMINISTRATION"
          title="Let’s restore your connection."
        />
        <EmptyState
          icon="globe"
          title="The property network is unavailable."
          action={
            <Button onClick={market.refresh} variant="secondary" icon="refresh">
              Retry connection
            </Button>
          }
        >
          {market.error ||
            "Start the local chain and deploy the contract before opening administration."}
        </EmptyState>
      </div>
    );
  if (!isOwner)
    return (
      <div className="page">
        <PageHeader
          eyebrow="ADMINISTRATION"
          title="Administrator access required."
        />
        <EmptyState
          icon="lock"
          title="This workspace belongs to the deployment wallet."
        >
          The connected wallet can browse and hold tokens, but it cannot manage
          listings or withdraw funds. Switch to the deployment wallet and
          reconnect.
        </EmptyState>
      </div>
    );
  return (
    <div className="admin-workspace">
      <aside className="admin-sidebar">
        <div className="workspace-label">
          <span className="workspace-icon">
            <Icon name="settings" size={21} />
          </span>
          <div>
            <strong>Operator workspace</strong>
            <span>BrickShare administration</span>
          </div>
        </div>
        <nav aria-label="Administration sections">
          {sections.map(([id, label, icon]) => (
            <button
              key={id}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon name={icon} size={18} />
              {label}
              {section === id && <Icon name="chevron" size={14} />}
            </button>
          ))}
        </nav>
        <div className="admin-wallet-note">
          <Icon name="shield" size={21} />
          <strong>Owner permissions</strong>
          <span title={wallet.account}>{shortAddress(wallet.account)}</span>
          <p>Restricted actions are enforced by the smart contract.</p>
        </div>
      </aside>
      <div className="admin-main">
        <PageHeader
          eyebrow="YOUR COLLECTION, UNDER CONTROL"
          title={
            section === "overview"
              ? "Workspace overview."
              : section === "listings"
              ? "Property management."
              : section === "create"
              ? "Create a property."
              : "Contract treasury."
          }
          description="A clear view of your listings, balances, and on-chain actions."
          actions={
            <Button
              variant="secondary"
              icon="refresh"
              onClick={market.refresh}
              disabled={market.refreshing}
            >
              Refresh
            </Button>
          }
        />
        {section === "overview" && (
          <>
            <div className="stats-grid admin-stats">
              <StatCard
                label="Total properties"
                value={market.properties.length}
                icon="building"
              />
              <StatCard label="Active listings" value={active} icon="layers" />
              <StatCard
                label="Collected funds"
                value={formatEth(market.balance)}
                unit="ETH"
                icon="wallet"
              />
            </div>
            <div className="admin-quick-action">
              <div>
                <span className="section-icon">
                  <Icon name="plus" />
                </span>
                <div>
                  <h2>A new addition to your collection?</h2>
                  <p>
                    Create a listing with a fixed supply and price per token.
                  </p>
                </div>
              </div>
              <Button onClick={() => setSection("create")} icon="plus">
                Create property
              </Button>
            </div>
          </>
        )}
        {["overview", "listings"].includes(section) && (
          <ListingsTable
            properties={market.properties}
            busy={busy}
            onStatus={app.setPropertyStatus}
          />
        )}
        {section === "create" && (
          <div className="admin-form-layout">
            <CreatePropertyForm busy={busy} onAdd={app.add} />
            <aside className="admin-form-aside">
              <span className="education-icon">
                <Icon name="file" size={25} />
              </span>
              <h3>The details matter.</h3>
              <p>
                Supply and price are recorded permanently for this listing.
                Check them carefully before confirming.
              </p>
              <hr />
              <h3>Beyond the basics</h3>
              <p>
                Descriptions, photographs, and public documents can be added
                through the project’s presentation metadata. They do not replace
                on-chain data.
              </p>
            </aside>
          </div>
        )}
        {section === "treasury" && (
          <Treasury
            balance={market.balance}
            busy={busy}
            onWithdraw={app.withdraw}
          />
        )}
        <Notice tone="info">
          This is a test-network workspace. Listing controls do not verify
          property ownership or establish investor rights.
        </Notice>
      </div>
    </div>
  );
}
