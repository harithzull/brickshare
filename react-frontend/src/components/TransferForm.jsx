import { useState } from "react";
import Icon from "./Icon";
import { Button } from "./ui";

export default function TransferForm({ holdings, busy, onTransfer }) {
  const [form, setForm] = useState({ id: "", to: "", amount: "" });
  const property = holdings.find((p) => p.id === form.id);
  return (
    <section className="panel transfer-panel" id="transfer-tokens">
      <div className="section-title">
        <div>
          <h2>Transfer tokens</h2>
          <p>Send part of your holding to another wallet.</p>
        </div>
        <span className="section-icon">
          <Icon name="send" />
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onTransfer(form, () => setForm({ id: "", to: "", amount: "" }));
        }}
      >
        <label htmlFor="transfer-property">Property</label>
        <select
          id="transfer-property"
          value={form.id}
          onChange={(event) => setForm({ ...form, id: event.target.value })}
          required
        >
          <option value="">Select a property</option>
          {holdings.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.mine} tokens
            </option>
          ))}
        </select>
        <label htmlFor="transfer-recipient">Recipient wallet address</label>
        <input
          id="transfer-recipient"
          placeholder="0x…"
          autoComplete="off"
          spellCheck="false"
          value={form.to}
          onChange={(event) => setForm({ ...form, to: event.target.value })}
          required
        />
        <label htmlFor="transfer-amount">Number of tokens</label>
        <div className="amount-field">
          <input
            id="transfer-amount"
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            value={form.amount}
            onChange={(event) =>
              setForm({ ...form, amount: event.target.value })
            }
            required
          />
          <span>tokens</span>
        </div>
        <p className="input-help">
          {property
            ? `${property.mine} tokens available in your wallet.`
            : "Choose one of your holdings to continue."}
        </p>
        <Button
          className="full-width"
          disabled={busy || !holdings.length}
          icon="arrowUpRight"
        >
          Review transfer
        </Button>
        <p className="form-disclosure">
          <Icon name="info" size={14} />
          Transfers do not collect a sale payment. Network fees apply.
        </p>
      </form>
    </section>
  );
}
