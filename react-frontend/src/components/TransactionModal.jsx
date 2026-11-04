import { useEffect, useRef, useState } from "react";
import { EXPECTED_CHAIN_ID, NETWORK_NAMES } from "../config";
import { formatEth, shortAddress } from "../lib/marketplace";
import Icon from "./Icon";
import { Button } from "./ui";

export default function TransactionModal({ quote, onCancel, onConfirm }) {
  const ref = useRef(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const sensitive = [
    "Withdraw collected funds",
    "Deactivate property",
  ].includes(quote.title);
  const withdrawing = quote.title === "Withdraw collected funds";
  useEffect(() => {
    const previous = document.activeElement;
    const element = ref.current;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
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
      aria-describedby="review-description"
    >
      <div className="dialog-top">
        <span className={`dialog-icon ${sensitive ? "sensitive" : ""}`}>
          <Icon name={sensitive ? "alert" : "wallet"} size={25} />
        </span>
        <button
          className="icon-button"
          aria-label="Close transaction review"
          onClick={onCancel}
        >
          <Icon name="close" size={19} />
        </button>
      </div>
      <p className="eyebrow">REVIEW BEFORE YOU SIGN</p>
      <h2 id="review-title">{quote.title}</h2>
      <p id="review-description">{quote.description}</p>
      <div className="review-network">
        <span className="network-dot" />
        {NETWORK_NAMES[EXPECTED_CHAIN_ID] || `Chain ${EXPECTED_CHAIN_ID}`}
        <span className="badge neutral">Test funds</span>
      </div>
      <dl className="review-list">
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
      {sensitive && (
        <label className="confirmation-check">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            {withdrawing
              ? "I understand this withdraws the entire available contract balance to the administrator."
              : "I understand this stops new purchases while existing token transfers remain allowed."}
          </span>
        </label>
      )}
      <p className="fee-note">
        <Icon name="info" size={15} />
        Gas includes a 20% limit buffer. Your wallet shows the final fee before
        signing.
      </p>
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant={sensitive ? "danger" : "primary"}
          disabled={sensitive && !acknowledged}
          onClick={onConfirm}
          icon="arrowUpRight"
        >
          Continue in wallet
        </Button>
      </div>
    </dialog>
  );
}
