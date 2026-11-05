import { useState } from "react";
import {
  formatEth,
  percentage,
  purchaseCost,
  safeContentUrl,
} from "../lib/marketplace";
import PropertyArt from "../components/PropertyArt";
import Icon from "../components/Icon";
import PropertyMetadataStatus from "../components/PropertyMetadataStatus";
import {
  Button,
  Notice,
  PageHeader,
  PropertyStatusBadge,
  RiskNote,
  SubscriptionProgress,
} from "../components/ui";

export default function PropertyDetailsPage({ property, app, navigate }) {
  const [amount, setAmount] = useState("1");
  const docs = (property.documents || []).filter(
    (document) =>
      document &&
      typeof document.title === "string" &&
      safeContentUrl(document.url)
  );
  let cost = null;
  let validation = "";
  if (!property.sample) {
    try {
      cost = purchaseCost(property, amount);
    } catch (error) {
      validation = error.message;
    }
  }
  const unavailable =
    property.sample || !property.active || property.available === "0";
  const disabled =
    app.busy || app.market.status !== "ready" || app.market.refreshing;
  return (
    <div className="page detail-page">
      <button
        className="text-link back-link"
        onClick={() =>
          navigate("marketplace", { mode: property.sample ? "sample" : "live" })
        }
      >
        <Icon name="arrowLeft" size={17} />
        Back to properties
      </button>
      <PageHeader
        eyebrow={
          property.sample
            ? "FICTIONAL PROPERTY PREVIEW"
            : `PROPERTY #${property.id} · ON-CHAIN LISTING`
        }
        title={property.name}
        description={
          <span className="property-location">
            <Icon name="location" size={17} />
            {property.location}
          </span>
        }
        actions={
          <div className="badge-row">
            <PropertyStatusBadge property={property} showSource />
            {property.sample && <PropertyStatusBadge property={property} />}
          </div>
        }
      />
      {property.sample && (
        <Notice
          tone="sample"
          title="A fictional property, an authentic look at the experience."
        >
          This sample is for exploration only. All figures are illustrative and
          transactions are disabled.
        </Notice>
      )}
      <div className="detail-grid">
        <div className="research-content">
          <PropertyMetadataStatus property={property} detailed />
          <div className="detail-image">
            <PropertyArt property={property} />
          </div>
          <nav className="research-nav" aria-label="Property sections">
            <a
              href="#property-overview"
              onClick={(event) => {
                event.preventDefault();
                document
                  .getElementById("property-overview")
                  ?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)"
                    ).matches
                      ? "auto"
                      : "smooth",
                  });
              }}
            >
              Overview
            </a>
            <a
              href="#property-tokenization"
              onClick={(event) => {
                event.preventDefault();
                document
                  .getElementById("property-tokenization")
                  ?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)"
                    ).matches
                      ? "auto"
                      : "smooth",
                  });
              }}
            >
              Token details
            </a>
            <a
              href="#property-documents"
              onClick={(event) => {
                event.preventDefault();
                document
                  .getElementById("property-documents")
                  ?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)"
                    ).matches
                      ? "auto"
                      : "smooth",
                  });
              }}
            >
              Documents
            </a>
          </nav>
          <section className="panel detail-section" id="property-overview">
            <p className="eyebrow">THE BIGGER PICTURE</p>
            <h2>About this property</h2>
            <p>
              {property.description ||
                "This property’s name, location, price, and token supply are recorded on-chain. The operator has not yet provided a detailed description or authenticated property photographs."}
            </p>
            <div className="property-facts">
              <div>
                <Icon name="location" />
                <span>
                  Location<strong>{property.location}</strong>
                </span>
              </div>
              <div>
                <Icon name="building" />
                <span>
                  Listing source
                  <strong>
                    {property.sample ? "Fictional sample" : "Deployed contract"}
                  </strong>
                </span>
              </div>
            </div>
          </section>
          {property.characteristics && Object.keys(property.characteristics).length > 0 && <section className="panel detail-section"><p className="eyebrow">OPERATOR-SUPPLIED METADATA</p><h2>Property characteristics</h2><dl className="facts">{Object.entries(property.characteristics).filter(([key])=>['propertyType','bedrooms','bathrooms','areaSqm','yearBuilt'].includes(key)).map(([key,value])=><div key={key}><dt>{({propertyType:'Property type',bedrooms:'Bedrooms',bathrooms:'Bathrooms',areaSqm:'Area (m²)',yearBuilt:'Year built'})[key]}</dt><dd>{String(value)}</dd></div>)}</dl></section>}
          <section className="panel detail-section" id="property-tokenization">
            <p className="eyebrow">UNDERSTAND YOUR FRACTION</p>
            <h2>Tokenization details</h2>
            <p>
              Each token represents an equal fraction of this listing’s fixed
              supply. These balances are application records and do not
              establish legal property ownership.
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
                <dt>Price per token</dt>
                <dd>
                  {property.priceEth} <small>ETH</small>
                </dd>
              </div>
              <div>
                <dt>Your token balance</dt>
                <dd>
                  {property.sample
                    ? "Not applicable"
                    : app.wallet
                    ? app.market.refreshing || app.market.status === "loading"
                      ? "Loading…"
                      : property.mine
                    : "Connect to view"}
                </dd>
              </div>
            </dl>
            <SubscriptionProgress property={property} />
          </section>
          <section className="panel detail-section" id="property-documents">
            <div className="section-title">
              <div>
                <p className="eyebrow">DO YOUR RESEARCH</p>
                <h2>Supporting documents</h2>
              </div>
              <Icon name="file" size={24} />
            </div>
            {docs.length ? (
              <ul className="document-list">
                {docs.map((document, i) => (
                  <li key={i}>
                    <a
                      href={safeContentUrl(document.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="document-icon">
                        <Icon name="file" />
                      </span>
                      <span>
                        {document.title}
                        <small>
                          {property.sample
                            ? "Fictional example"
                            : "Operator supplied · not independently verified"}
                        </small>
                      </span>
                      <Icon name="arrowUpRight" size={19} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="document-empty">
                <Icon name="file" size={24} />
                <p>
                  No supporting documents have been published for this property.
                </p>
              </div>
            )}
          </section>
          <section className="detail-risk">
            <Icon name="shield" size={24} />
            <div>
              <h3>A transparent view of the limitations.</h3>
              <p>
                Purchases send test ETH to the contract, and the administrator
                can withdraw all collected funds. There is no rental income,
                refund system, redemption facility, or guaranteed return. Tokens
                do not transfer legal title.
              </p>
            </div>
          </section>
        </div>
        <aside className="panel purchase-panel">
          <div className="purchase-panel-top">
            <span className="eyebrow">YOUR NEXT STEP</span>
            <PropertyStatusBadge property={property} />
          </div>
          <p className="price-caption">Price per token</p>
          <div className="detail-price">
            {property.priceEth}
            <span>ETH</span>
          </div>
          <p className="small muted">
            {property.sample
              ? "Illustrative price · sample property"
              : "Test funds only · network fees apply"}
          </p>
          <div className="available-summary">
            <Icon name="layers" size={18} />
            <span>
              <strong>{property.available}</strong> of {property.total} tokens
              available
            </span>
          </div>
          {property.sample ? (
            <>
              <Notice tone="sample">
                This is a fictional sample. To interact with a contract, explore
                live listings.
              </Notice>
              <Button
                className="full-width"
                variant="secondary"
                onClick={() => navigate("marketplace", { mode: "live" })}
                icon="arrow"
              >
                Browse live properties
              </Button>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (cost) app.buy(property, amount);
              }}
            >
              <label htmlFor="buy-quantity">How many tokens?</label>
              <input
                id="buy-quantity"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                disabled={unavailable}
                aria-invalid={validation && !unavailable ? true : undefined}
                aria-describedby={validation ? "buy-validation" : "buy-help"}
              />
              <div className="purchase-summary">
                <div>
                  <span>Token payment</span>
                  <strong>{cost ? `${formatEth(cost)} ETH` : "—"}</strong>
                </div>
                <div>
                  <span>Share of token supply</span>
                  <strong>
                    {cost ? percentage(amount, property.total) : "0.00"}%
                  </strong>
                </div>
                <div>
                  <span>Network fee</span>
                  <span>Estimated at review</span>
                </div>
              </div>
              {validation && (
                <p className="field-error" id="buy-validation">
                  {validation}
                </p>
              )}
              {app.wallet ? (
                <Button
                  className="full-width"
                  disabled={disabled || !cost}
                  icon="arrowUpRight"
                >
                  Review purchase
                </Button>
              ) : (
                <Button
                  type="button"
                  className="full-width"
                  disabled={disabled || !cost}
                  onClick={app.connect}
                  icon="wallet"
                >
                  Connect wallet to buy
                </Button>
              )}
              <p id="buy-help" className="purchase-help">
                <Icon name="lock" size={14} />
                Review payment and gas before you sign.
              </p>
            </form>
          )}
          <RiskNote compact />
        </aside>
      </div>
    </div>
  );
}
