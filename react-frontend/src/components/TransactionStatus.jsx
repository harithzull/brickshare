import { useEffect, useRef } from "react";
import Icon from "./Icon";
import { EXPLORER_URL } from "../config";

export default function TransactionStatus({ transaction, onDismiss }) {
  const heading = useRef(null);
  const pending = ["awaiting", "pending"].includes(transaction.status);
  useEffect(() => {
    if (transaction.status === "error")
      heading.current?.focus({ preventScroll: true });
  }, [transaction.status]);
  return (
    <section
      className={`transaction-status ${transaction.status}`}
      role={transaction.status === "error" ? "alert" : "status"}
      aria-label="Transaction status"
    >
      <div className="transaction-status-heading">
        <span
          className={`transaction-state-icon ${pending ? "is-pending" : ""}`}
        >
          <Icon
            name={
              transaction.status === "success"
                ? "check"
                : transaction.status === "error"
                ? "alert"
                : "clock"
            }
            size={21}
          />
        </span>
        <div>
          <span>
            {pending
              ? "TRANSACTION IN PROGRESS"
              : transaction.status === "success"
              ? "CONFIRMED ON-CHAIN"
              : "TRANSACTION UPDATE"}
          </span>
          <h2 ref={heading} tabIndex="-1">
            {transaction.title}
          </h2>
        </div>
        {!pending && (
          <button
            className="icon-button"
            aria-label="Dismiss transaction status"
            onClick={onDismiss}
          >
            <Icon name="close" size={17} />
          </button>
        )}
      </div>
      <p>{transaction.message}</p>
      {transaction.hash && (
        <details>
          <summary>View transaction hash</summary>
          <code>{transaction.hash}</code>
          {EXPLORER_URL && (
            <a
              className="text-link"
              href={`${EXPLORER_URL}/tx/${transaction.hash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on explorer <Icon name="arrowUpRight" size={14} />
            </a>
          )}
        </details>
      )}
    </section>
  );
}
