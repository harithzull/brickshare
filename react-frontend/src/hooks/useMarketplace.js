import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  EXPECTED_CHAIN_ID,
  RPC_URL,
  DEPLOYMENT_BLOCK,
} from "../config";
import metadata from "../data/property-metadata.json";
import { readProperties, readActivity } from "../lib/marketplace";

export default function useMarketplace(account) {
  const [state, setState] = useState({
    dataAccount: null,
    status: "loading",
    properties: [],
    owner: null,
    balance: "0",
    activity: [],
    activityError: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);
  const latestAccount = useRef(account);
  latestAccount.current = account;
  const provider = useMemo(
    () =>
      RPC_URL
        ? new ethers.providers.JsonRpcProvider(
            { url: RPC_URL, timeout: 7000 },
            EXPECTED_CHAIN_ID
          )
        : null,
    []
  );
  const refresh = useCallback(async () => {
    // A transaction submitted by a previous wallet can finish after an account
    // change. Its old refresh callback must not replace the new wallet's data.
    if (account !== latestAccount.current) return;
    const request = ++sequence.current;
    if (!CONTRACT_ADDRESS || !provider) {
      setState({
        dataAccount: account,
        status: "unconfigured",
        properties: [],
        owner: null,
        balance: "0",
        activity: [],
        activityError: null,
      });
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const network = await provider.getNetwork();
      if (network.chainId !== EXPECTED_CHAIN_ID)
        throw new Error("Read-only RPC is on the wrong network.");
      if ((await provider.getCode(CONTRACT_ADDRESS)) === "0x")
        throw new Error(
          "No contract exists at the configured address. Redeploy after restarting the local chain."
        );
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider
      );
      const [properties, owner, balance] = await Promise.all([
        readProperties(contract, account),
        contract.owner(),
        provider.getBalance(CONTRACT_ADDRESS),
      ]);
      const catalog = properties.map((p) => {
        const extra =
          metadata[
            `${EXPECTED_CHAIN_ID}:${CONTRACT_ADDRESS.toLowerCase()}:${p.id}`
          ] || {};
        // Presentation metadata must never override on-chain supply, price, status or balances.
        return {
          description: extra.description,
          image: extra.image,
          imageAlt: extra.imageAlt,
          imageCaption: extra.imageCaption,
          documents: Array.isArray(extra.documents) ? extra.documents : [],
          ...p,
        };
      });
      if (request !== sequence.current) return;
      setState({
        dataAccount: account,
        status: "ready",
        properties: catalog,
        owner,
        balance: balance.toString(),
        activity: [],
        activityError: null,
      });
      if (account) {
        try {
          const activity = await readActivity(
            contract,
            account,
            DEPLOYMENT_BLOCK
          );
          if (request === sequence.current)
            setState((current) => ({ ...current, activity }));
        } catch {
          if (request === sequence.current)
            setState((current) => ({
              ...current,
              activityError:
                "Transaction history could not be loaded from the RPC. Your current holdings are shown above. Try refreshing.",
            }));
        }
      }
    } catch (error) {
      if (request === sequence.current)
        setState({
          dataAccount: account,
          status: "error",
          error: error.message.includes("No contract")
            ? error.message
            : "The property network is unavailable. Check that the local blockchain is running and the contract has been deployed, then retry.",
          properties: [],
          owner: null,
          balance: "0",
          activity: [],
          activityError: null,
        });
    } finally {
      if (request === sequence.current) setRefreshing(false);
    }
  }, [account, provider]);

  useEffect(() => {
    refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);

  // Never expose a previous wallet's holdings while a new wallet is loading.
  if (state.dataAccount !== account)
    return {
      status: "loading",
      properties: [],
      owner: null,
      balance: "0",
      activity: [],
      activityError: null,
      refreshing: true,
      refresh,
      provider,
    };
  return { ...state, refreshing, refresh, provider };
}
