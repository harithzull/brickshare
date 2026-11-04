import { useEffect, useState } from "react";
import { EXPECTED_CHAIN_ID, NETWORK_NAMES } from "../config";
import { shortAddress } from "../lib/marketplace";
import { routeHref } from "../lib/navigation";
import Icon from "./Icon";
import { Button } from "./ui";

export function Brand() {
  return (
    <a className="brand" href={routeHref("home")} aria-label="BrickShare home">
      <span className="brand-mark">
        <svg
          width="26"
          height="28"
          viewBox="0 0 26 28"
          fill="none"
          aria-hidden="true"
        >
          <path d="m2 7 10-5 12 6-10 5L2 7Z" fill="currentColor" />
          <path
            d="m2 13 10 5 12-6v6l-12 6-10-5v-6Z"
            fill="currentColor"
            opacity=".7"
          />
          <path d="m2 21 10 5 12-6" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      </span>
      BrickShare<span className="brand-period">.</span>
    </a>
  );
}

export function WalletButton({ app }) {
  return app.wallet ? (
    <div className="connected-wallet">
      <span className="wallet-avatar" aria-hidden="true">
        <Icon name="wallet" size={16} />
      </span>
      <span>
        <small>{app.isOwner ? "Administrator" : "Connected wallet"}</small>
        <strong title={app.wallet.account}>
          {shortAddress(app.wallet.account)}
        </strong>
      </span>
      <button
        className="icon-button"
        aria-label="Disconnect wallet from BrickShare"
        onClick={app.disconnect}
        disabled={app.busy}
      >
        <Icon name="logout" size={16} />
      </button>
    </div>
  ) : (
    <Button onClick={app.connect} disabled={app.connecting} icon="wallet">
      {app.connecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}

export default function Navbar({ route, app }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [route.page, route.id, route.mode]);
  const active = route.page === "property" ? "marketplace" : route.page;
  const links = [
    ["home", "Overview"],
    ["marketplace", "Properties"],
    ["portfolio", "My portfolio"],
    ["admin", "Administration"],
  ];
  return (
    <>
      <div className="demo-strip">
        <span className="demo-pill">TEST NETWORK</span>
        <span>A real interface. Test funds only.</span>
        <span className="demo-strip-detail">
          No real property ownership or returns.
        </span>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            {links.map(([page, label]) => (
              <a
                key={page}
                href={routeHref(page)}
                aria-current={active === page ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <span
              className="network-indicator"
              title={
                app.market.status === "ready"
                  ? "Read-only network available"
                  : "Expected network · read-only connection unavailable"
              }
            >
              <span
                className={`network-dot ${
                  app.market.status !== "ready" ? "offline" : ""
                }`}
              />
              {EXPECTED_CHAIN_ID === 31337
                ? "Local testnet"
                : NETWORK_NAMES[EXPECTED_CHAIN_ID] ||
                  `Chain ${EXPECTED_CHAIN_ID}`}
            </span>
            <WalletButton app={app} />
            <button
              className="icon-button mobile-menu-toggle"
              aria-expanded={expanded}
              aria-controls="mobile-navigation"
              aria-label={expanded ? "Close navigation" : "Open navigation"}
              onClick={() => setExpanded(!expanded)}
            >
              <Icon name={expanded ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {expanded && (
          <nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Mobile navigation"
          >
            {links.map(([page, label]) => (
              <a
                key={page}
                href={routeHref(page)}
                aria-current={active === page ? "page" : undefined}
                onClick={() => setExpanded(false)}
              >
                {label}
                <Icon name="arrow" size={17} />
              </a>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
