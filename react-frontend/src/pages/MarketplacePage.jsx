import { useMemo, useState } from "react";
import { filterProperties } from "../lib/marketplace";
import PropertyGrid from "../components/PropertyGrid";
import Icon from "../components/Icon";
import {
  Button,
  EmptyState,
  LoadingSkeleton,
  Notice,
  PageHeader,
  RiskNote,
} from "../components/ui";

export default function MarketplacePage({ market, catalog, mode, navigate }) {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const properties = useMemo(
    () => filterProperties(catalog, search, location, status),
    [catalog, search, location, status]
  );
  const clear = () => {
    setSearch("");
    setLocation("");
    setStatus("");
  };
  return (
    <div className="page marketplace-page">
      <PageHeader
        eyebrow="THE PROPERTY COLLECTION"
        title="Explore properties."
        description="A closer look at the places, the numbers, and the possibilities."
        actions={
          <Button
            variant="secondary"
            icon="refresh"
            onClick={market.refresh}
            disabled={mode === "sample" || market.refreshing}
          >
            {market.refreshing && mode === "live"
              ? "Refreshing…"
              : "Refresh listings"}
          </Button>
        }
      />
      <div className="catalog-toolbar">
        <div className="segmented" aria-label="Catalog source">
          <button
            aria-pressed={mode === "live"}
            onClick={() => navigate("marketplace", { mode: "live" })}
          >
            <span className="network-dot" />
            Live listings
          </button>
          <button
            aria-pressed={mode === "sample"}
            onClick={() => navigate("marketplace", { mode: "sample" })}
          >
            Sample preview
          </button>
        </div>
        <p>
          <Icon name="info" size={15} />
          {mode === "sample"
            ? "Fictional data. Explore freely."
            : "Read-only browsing. No wallet required."}
        </p>
      </div>
      {mode === "sample" && (
        <Notice
          tone="sample"
          title="You’re exploring a fictional sample collection."
        >
          All properties, prices, and subscription figures are illustrative.
          Purchases and transfers are disabled.
        </Notice>
      )}
      <div className="filter-bar">
        <div className="search-field">
          <label className="sr-only" htmlFor="property-search">
            Search properties
          </label>
          <Icon name="search" size={19} />
          <input
            id="property-search"
            type="search"
            placeholder="Search properties or locations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="location-filter">
            Location
          </label>
          <select
            id="location-filter"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="">All locations</option>
            {[...new Set(catalog.map((p) => p.location))].sort().map((loc) => (
              <option key={loc}>{loc}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="status-filter">
            Availability
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All availability</option>
            <option value="available">Available</option>
            <option value="sold-out">Sold out</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {(search || location || status) && (
          <button className="filter-reset" onClick={clear}>
            Clear filters
          </button>
        )}
      </div>
      {mode === "live" && market.status === "loading" ? (
        <LoadingSkeleton />
      ) : mode === "live" &&
        ["unconfigured", "error"].includes(market.status) ? (
        <EmptyState
          icon={market.status === "error" ? "globe" : "building"}
          title={
            market.status === "error"
              ? "The property network is taking a break."
              : "Your collection is ready for its first chapter."
          }
          action={
            <>
              <Button
                onClick={() => navigate("marketplace", { mode: "sample" })}
              >
                Explore sample collection
              </Button>
              {market.status === "error" && (
                <Button
                  variant="secondary"
                  icon="refresh"
                  onClick={market.refresh}
                  disabled={market.refreshing}
                >
                  Retry connection
                </Button>
              )}
            </>
          }
        >
          {market.error ||
            "A live contract hasn’t been configured yet. Explore the fictional sample collection while your local deployment is prepared."}
        </EmptyState>
      ) : !catalog.length ? (
        <EmptyState
          title="Every collection starts somewhere."
          action={
            <Button
              variant="secondary"
              onClick={() => navigate("admin")}
              icon="plus"
            >
              Open administration
            </Button>
          }
        >
          No properties have been added to this contract. The administrator can
          create the first listing.
        </EmptyState>
      ) : (
        <>
          <div className="result-heading">
            <p role="status">
              <strong>{properties.length}</strong>{" "}
              {properties.length === 1 ? "property" : "properties"}{" "}
              {mode === "sample"
                ? "in the sample collection"
                : "on this contract"}
            </p>
            <span>
              {mode === "sample"
                ? "Illustrative information"
                : "On-chain supply & pricing"}
            </span>
          </div>
          {properties.length ? (
            <PropertyGrid
              properties={properties}
              onSelect={(id) => navigate("property", { id, mode })}
            />
          ) : (
            <EmptyState
              icon="search"
              title="A different perspective might help."
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              }
            >
              No properties match these filters. Try another location or search
              term.
            </EmptyState>
          )}
        </>
      )}
      <RiskNote compact />
    </div>
  );
}
