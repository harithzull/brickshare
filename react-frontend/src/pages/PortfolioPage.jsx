import { useMemo } from "react";
import {
  formatEth,
  percentage,
  portfolioSummary,
  shortAddress,
} from "../lib/marketplace";
import Icon from "../components/Icon";
import PropertyArt from "../components/PropertyArt";
import PortfolioAllocation from "../components/PortfolioAllocation";
import TransferForm from "../components/TransferForm";
import ActivityList from "../components/ActivityList";
import {
  Button,
  EmptyState,
  LoadingSkeleton,
  Notice,
  PageHeader,
  PropertyStatusBadge,
  RiskNote,
  StatCard,
} from "../components/ui";

export default function PortfolioPage({ app, navigate }) {
  const { wallet, market, busy } = app;
  const summary = useMemo(
    () => portfolioSummary(market.properties),
    [market.properties]
  );
  const { holdings, tokens, referenceWei, allocation } = summary;
  return (
    <div className="page portfolio-page">
      <PageHeader
        eyebrow="YOUR PROPERTY PERSPECTIVE"
        title="Your portfolio."
        description={
          wallet ? (
            <>
              A clear view of your holdings.{" "}
              <span className="inline-wallet" title={wallet.account}>
                {shortAddress(wallet.account)}
              </span>
            </>
          ) : (
            "Every journey starts with a clearer picture."
          )
        }
        actions={
          wallet && (
            <Button
              variant="secondary"
              icon="refresh"
              onClick={market.refresh}
              disabled={market.refreshing}
            >
              {market.refreshing ? "Refreshing…" : "Refresh balances"}
            </Button>
          )
        }
      />
      {!wallet ? (
        <EmptyState
          icon="wallet"
          title="Your portfolio starts with a connection."
          action={
            <>
              <Button
                onClick={app.connect}
                disabled={app.connecting}
                icon="wallet"
              >
                Connect wallet
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate("marketplace")}
              >
                Explore properties
              </Button>
            </>
          }
        >
          Connect your wallet to see token balances, your share of each
          property’s supply, and confirmed activity. Your wallet stays in your
          control.
        </EmptyState>
      ) : market.refreshing || market.status === "loading" ? (
        <LoadingSkeleton variant="stats" />
      ) : market.status !== "ready" ? (
        <EmptyState
          icon="globe"
          title="Let’s reconnect to your holdings."
          action={
            <Button variant="secondary" onClick={market.refresh} icon="refresh">
              Retry connection
            </Button>
          }
        >
          {market.error ||
            "Live blockchain data is unavailable. Restore the local network and refresh to see your portfolio."}
        </EmptyState>
      ) : (
        <>
          <div className="stats-grid portfolio-stats">
            <StatCard
              label="Value at listing prices"
              value={formatEth(referenceWei)}
              unit="ETH"
              note="Reference only · not market value or profit"
              icon="chart"
              accent
            />
            <StatCard
              label="Properties held"
              value={holdings.length}
              note="Properties with a nonzero token balance"
              icon="building"
            />
            <StatCard
              label="Total token holdings"
              value={tokens.toString()}
              note="Token units across your properties"
              icon="layers"
            />
          </div>
          {!holdings.length ? (
            <EmptyState
              title="Your first fraction is still ahead."
              action={
                <Button
                  onClick={() => navigate("marketplace")}
                  icon="arrowUpRight"
                >
                  Explore properties
                </Button>
              }
            >
              No tokens are held by this wallet on the current contract. Browse
              live properties or receive tokens from another holder.
            </EmptyState>
          ) : (
            <>
              <PortfolioAllocation allocation={allocation} />
              <div className="section-heading holdings-heading">
                <div>
                  <p className="eyebrow">YOUR COLLECTION</p>
                  <h2>Individual holdings</h2>
                </div>
                <span className="source-label">
                  <span className="network-dot" />
                  Live wallet balances
                </span>
              </div>
              <div className="holdings-grid">
                {holdings.map((property) => (
                  <article className="holding-card" key={property.id}>
                    <div className="holding-image">
                      <PropertyArt property={property} />
                    </div>
                    <div className="holding-body">
                      <div className="holding-title">
                        <div>
                          <p className="property-location">
                            <Icon name="location" size={13} />
                            {property.location}
                          </p>
                          <h3>{property.name}</h3>
                        </div>
                        <PropertyStatusBadge property={property} />
                      </div>
                      <dl className="holding-facts">
                        <div>
                          <dt>Your tokens</dt>
                          <dd>{property.mine}</dd>
                        </div>
                        <div>
                          <dt>Share of supply</dt>
                          <dd>{percentage(property.mine, property.total)}%</dd>
                        </div>
                        <div>
                          <dt>At listing price</dt>
                          <dd>
                            {formatEth(property.priceWei.mul(property.mine))}{" "}
                            <small>ETH</small>
                          </dd>
                        </div>
                      </dl>
                      <button
                        className="text-link"
                        onClick={() =>
                          navigate("property", { id: property.id })
                        }
                      >
                        View property
                        <Icon name="arrowUpRight" size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          <div className="portfolio-bottom">
            <section className="panel activity-panel">
              <div className="section-title">
                <div>
                  <h2>Your activity</h2>
                  <p>
                    Confirmed purchases and transfers. A record you can follow.
                  </p>
                </div>
                <span className="section-icon">
                  <Icon name="clock" />
                </span>
              </div>
              {market.activityError ? (
                <Notice tone="error" role="alert">
                  {market.activityError}
                </Notice>
              ) : market.activity.length ? (
                <ActivityList
                  activity={market.activity}
                  properties={market.properties}
                />
              ) : (
                <EmptyState
                  icon="clock"
                  compact
                  title="Nothing on the timeline yet."
                >
                  Your confirmed purchases and transfers will appear here.
                </EmptyState>
              )}
            </section>
            <TransferForm
              holdings={holdings}
              busy={busy}
              onTransfer={app.transfer}
            />
          </div>
        </>
      )}
      <RiskNote />
    </div>
  );
}
