import { useState } from "react";
import Icon from "./Icon";
import { Button } from "./ui";

export default function CreatePropertyForm({ busy, onAdd }) {
  const [form, setForm] = useState({
    name: "",
    location: "",
    total: "",
    price: "",
  });
  return (
    <section className="panel create-property-panel">
      <div className="section-title">
        <div>
          <h2>Create a property</h2>
          <p>Define the listing and its fixed token supply.</p>
        </div>
        <span className="section-icon">
          <Icon name="building" />
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(form, () =>
            setForm({ name: "", location: "", total: "", price: "" })
          );
        }}
      >
        <fieldset disabled={busy}>
          <legend className="sr-only">Property details</legend>
          <label htmlFor="add-name">Property name</label>
          <input
            id="add-name"
            placeholder="e.g. Cyberjaya Residences"
            maxLength="160"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <label htmlFor="add-location">Location</label>
          <input
            id="add-location"
            placeholder="e.g. Cyberjaya, Malaysia"
            maxLength="160"
            value={form.location}
            onChange={(event) =>
              setForm({ ...form, location: event.target.value })
            }
            required
          />
          <div className="form-columns">
            <div>
              <label htmlFor="add-total">Total token supply</label>
              <input
                id="add-total"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                placeholder="1000"
                value={form.total}
                onChange={(event) =>
                  setForm({ ...form, total: event.target.value })
                }
                required
              />
              <p className="input-help">A positive whole number.</p>
            </div>
            <div>
              <label htmlFor="add-price">Price per token (ETH)</label>
              <input
                id="add-price"
                inputMode="decimal"
                placeholder="0.01"
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value })
                }
                required
              />
              <p className="input-help">Up to 18 decimal places.</p>
            </div>
          </div>
          <div className="form-advice">
            <Icon name="info" size={18} />
            <p>
              Price, supply, name, and location are fixed after creation. All
              tokens start available for purchase; creating a listing does not
              credit your wallet.
            </p>
          </div>
          <Button className="full-width" icon="arrowUpRight" disabled={busy}>
            Review new listing
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
