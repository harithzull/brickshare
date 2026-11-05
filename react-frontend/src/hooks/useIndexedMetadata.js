import { useEffect, useRef, useState } from "react";
import { fallback, integrationFailure, loadIndexedCatalog, mergeIndexedCatalog, recent } from "../lib/indexed-catalog.ts";

// Public metadata state is independent of RPC readiness and transaction busy state.
export default function useIndexedMetadata({ listings, ready, rpc, chain, client, codeHash, selectedId, configurationError, now = Date.now }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(() => now());
  const sequence = useRef(0);
  const refresh = () => setRetry(value => value + 1);
  useEffect(() => {
    if (!ready || !client?.settings.baseUrl || !rpc) return;
    let stopped = false;
    let active;
    let next;
    const run = async () => {
      const request = ++sequence.current;
      active?.abort(); active = new AbortController();
      setLoading(true);
      try {
        const catalog = await loadIndexedCatalog({ client, chain, rpc, codeHash, selectedId, signal: active.signal, now });
        if (!stopped && request === sequence.current) { setResult({ listings, catalog }); setClock(now()); }
      } catch (error) {
        if (!stopped && request === sequence.current && error?.code !== "aborted") setResult({ listings, catalog: integrationFailure(error) });
      } finally {
        if (!stopped && request === sequence.current) { setLoading(false); next = setTimeout(run, client.settings.pollMs); }
      }
    };
    run();
    const tick = setInterval(() => setClock(now()), 1000);
    return () => { stopped = true; sequence.current++; active?.abort(); clearTimeout(next); clearInterval(tick); };
  }, [listings, ready, rpc, chain, client, codeHash, selectedId, retry, now]);

  let catalog = !client?.settings.baseUrl
    ? fallback(configurationError ? "unavailable" : "disabled", configurationError || "API metadata is not enabled. Listings use blockchain RPC and any configured local metadata.")
    : result?.listings === listings ? result.catalog : fallback("loading", "Checking published metadata. Blockchain RPC listings and wallet actions are available.");
  if (catalog.state === "ready" && (!catalog.sync || !recent(catalog.sync, client.settings.maxAgeMs, clock) || clock - catalog.checkedAt > client.settings.maxAgeMs)) catalog = fallback("stale", "Published API metadata has expired. Listings still use blockchain RPC; retry metadata to check the indexer.");
  return { properties: mergeIndexedCatalog(listings, catalog, client?.settings.maxAgeMs ?? 30000, clock), metadata: { ...catalog, loading: ready && !!client?.settings.baseUrl && loading, refresh } };
}
