import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  EXPECTED_CHAIN_ID,
  NETWORK_NAMES,
  RPC_URL,
} from "../config";
import {
  positiveInteger,
  prettyError,
  purchaseCost,
  shortAddress,
} from "../lib/marketplace";
import useMarketplace from "./useMarketplace";

const networkName =
  NETWORK_NAMES[EXPECTED_CHAIN_ID] || `Chain ${EXPECTED_CHAIN_ID}`;

// Existing wallet and transaction orchestration, separated from page presentation.
export default function useBrickShare({ mode = "live" }) {
  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [walletChain, setWalletChain] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tx, setTx] = useState(null);
  const [quote, setQuote] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const lock = useRef(false);
  const walletSession = useRef(0);
  const market = useMarketplace(wallet?.account || null);
  const isOwner =
    !!wallet && market.owner?.toLowerCase() === wallet.account.toLowerCase();
  const busy =
    connecting ||
    estimating ||
    tx?.status === "awaiting" ||
    tx?.status === "pending";
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

  const setPropertyStatus = (property) =>
    review(
      property.active ? "Deactivate property" : "Activate property",
      property.active
        ? `Stop new purchases for ${property.name}. Existing holders can still transfer tokens.`
        : `Allow new purchases for ${property.name} when tokens are available.`,
      async (contract) => {
        if (!isOwner)
          throw new Error("Only the administrator can change property status.");
        if (property.sample)
          throw new Error("Sample properties cannot be changed.");
        return contract.populateTransaction.setPropertyStatus(
          property.id,
          !property.active
        );
      }
    );

  const disconnect = () => {
    walletSession.current++;
    setWallet(null);
    setQuote(null);
    setWalletChain(null);
    setNotice(null);
  };
  return {
    wallet,
    connecting,
    walletChain,
    notice,
    tx,
    quote,
    estimating,
    market,
    isOwner,
    busy,
    connect,
    switchNetwork,
    confirm,
    buy,
    transfer,
    add,
    withdraw,
    setPropertyStatus,
    disconnect,
    cancelReview: () => setQuote(null),
    dismissNotice: () => setNotice(null),
    dismissTx: () => setTx(null),
  };
}
