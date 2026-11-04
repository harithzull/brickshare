import PropertyArt from "./PropertyArt";
import { subscription } from "../lib/marketplace";

export default function PropertyCard({ property, onSelect }) {
  const progress = subscription(property);
  const state = !property.active
    ? "Inactive"
    : property.available === "0"
    ? "Sold out"
    : "Available";
  return (
    <article className="property-card">
      <div className="card-visual">
        <PropertyArt property={property} />
        <span
          className={`badge ${state === "Available" ? "available" : "neutral"}`}
        >
          {property.sample ? "Sample listing" : state}
        </span>
      </div>
      <div className="property-card-body">
        <p className="eyebrow">{property.location}</p>
        <h3>
          <button
            className="title-button"
            onClick={() => onSelect(property.id)}
          >
            {property.name}
          </button>
        </h3>
        <div className="price-line">
          <strong>
            {property.priceEth} <small>ETH</small>
          </strong>
          <span>per token</span>
        </div>
        <div className="progress-label">
          <span>Supply subscribed</span>
          <strong>{progress}%</strong>
        </div>
        <progress
          max="100"
          value={progress}
          aria-label={`${property.name}: ${progress}% subscribed`}
        />
        <div className="card-foot">
          <span>
            {property.available} / {property.total} available
          </span>
          <button
            className="text-button"
            onClick={() => onSelect(property.id)}
            aria-label={`View ${property.name}`}
          >
            View property <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </article>
  );
}
