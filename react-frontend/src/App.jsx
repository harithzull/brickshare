import { lazy, Suspense, useEffect, useRef } from "react";
import useBrickShare from "./hooks/useBrickShare";
import useNavigation from "./hooks/useNavigation";
import { sampleProperties } from "./data/samples";
import { EXPECTED_CHAIN_ID } from "./config";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import TransactionModal from "./components/TransactionModal";
import TransactionStatus from "./components/TransactionStatus";
import { Button, EmptyState, LoadingSkeleton, Notice } from "./components/ui";
import HomePage from "./pages/HomePage";
import MarketplacePage from "./pages/MarketplacePage";
import "./App.css";

const PropertyDetailsPage = lazy(() => import("./pages/PropertyDetailsPage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

export default function App() {
  const { route, navigate } = useNavigation();
  const app = useBrickShare({ mode: route.mode });
  const { market } = app;
  const firstRender = useRef(true);
  const snapshot = useRef({ source: null, properties: [] });
  if (
    market.status === "ready" &&
    snapshot.current.source !== market.properties
  ) {
    // Retain public research content while wallet-specific balances reload.
    // Never retain a previous wallet's private dashboard context.
    snapshot.current = {
      source: market.properties,
      properties: market.properties.map((property) => ({
        ...property,
        mine: "0",
      })),
    };
  }
  const catalog =
    route.mode === "sample" ? sampleProperties : market.properties;
  const property =
    catalog.find((item) => item.id === route.id) ||
    (route.mode === "live" && market.status === "loading"
      ? snapshot.current.properties.find((item) => item.id === route.id)
      : null);

  useEffect(() => {
    const titles = {
      home: "A clearer perspective on property",
      marketplace: "Explore properties",
      portfolio: "Your portfolio",
      admin: "Administration",
      property: property?.name || "Property details",
    };
    document.title = `${titles[route.page]} · BrickShare`;
  }, [route.page, property?.name]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const anchor = ["#journey", "#understand"].includes(window.location.hash)
      ? window.location.hash.slice(1)
      : null;
    if (anchor) {
      requestAnimationFrame(() =>
        document.getElementById(anchor)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      );
    } else {
      window.scrollTo(0, 0);
      document.getElementById("main")?.focus({ preventScroll: true });
    }
  }, [route]);

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <Navbar route={route} app={app} />
      <main
        id="main"
        tabIndex="-1"
        className={
          route.page === "admin"
            ? "main-container admin-container"
            : "main-container"
        }
      >
        {app.notice && (
          <Notice
            tone={
              app.walletChain && app.walletChain !== EXPECTED_CHAIN_ID
                ? "warning"
                : "info"
            }
            role="alert"
            onDismiss={app.dismissNotice}
            action={
              app.walletChain && app.walletChain !== EXPECTED_CHAIN_ID ? (
                <Button variant="secondary" onClick={app.switchNetwork}>
                  Switch network
                </Button>
              ) : null
            }
          >
            {app.notice}
          </Notice>
        )}
        {app.estimating && (
          <Notice>
            Preparing your transaction and estimating the network fee…
          </Notice>
        )}
        <Suspense
          fallback={
            <div className="page">
              <LoadingSkeleton />
            </div>
          }
        >
          {route.page === "home" && (
            <HomePage market={market} navigate={navigate} />
          )}
          {route.page === "marketplace" && (
            <MarketplacePage
              key={route.mode}
              market={market}
              catalog={catalog}
              mode={route.mode}
              navigate={navigate}
            />
          )}
          {route.page === "property" &&
            (property ? (
              <PropertyDetailsPage
                key={`${route.mode}:${property.id}`}
                property={property}
                app={app}
                navigate={navigate}
              />
            ) : market.status === "loading" && route.mode === "live" ? (
              <div className="page">
                <LoadingSkeleton />
              </div>
            ) : (
              <div className="page">
                <EmptyState
                  title={
                    market.status === "error"
                      ? "The property network is unavailable."
                      : "This property isn’t available here."
                  }
                  action={
                    <>
                      <Button
                        onClick={() =>
                          navigate("marketplace", { mode: route.mode })
                        }
                      >
                        Back to properties
                      </Button>
                      {route.mode === "live" && (
                        <Button
                          variant="secondary"
                          onClick={market.refresh}
                          icon="refresh"
                        >
                          Retry connection
                        </Button>
                      )}
                    </>
                  }
                >
                  {market.error ||
                    "Check the selected catalog or return to the collection to find another property."}
                </EmptyState>
              </div>
            ))}
          {route.page === "portfolio" && (
            <PortfolioPage app={app} navigate={navigate} />
          )}
          {route.page === "admin" && <AdminPage app={app} />}
        </Suspense>
      </main>
      <Footer />
      {app.quote && (
        <TransactionModal
          quote={app.quote}
          onCancel={app.cancelReview}
          onConfirm={app.confirm}
        />
      )}
      {app.tx && (
        <TransactionStatus transaction={app.tx} onDismiss={app.dismissTx} />
      )}
    </div>
  );
}
