import PropertyArt from "./PropertyArt";
import Icon from "./Icon";
import { PropertyStatusBadge, SubscriptionProgress } from "./ui";
import PropertyMetadataStatus from "./PropertyMetadataStatus";

export default function PropertyCard({ property, onSelect }) {
  return (
    <article className="property-card">
      <div className="card-visual">
        <PropertyArt property={property} />
        <div className="card-badges">
          <PropertyStatusBadge property={property} showSource />
          {property.sample && <PropertyStatusBadge property={property} />}
        </div>
      </div>
      <div className="property-card-body">
        <p className="property-location">
          <Icon name="location" size={14} />
          {property.location}
        </p>
        <h3>
          <button
            className="title-button"
            onClick={() => onSelect(property.id)}
          >
            {property.name}
          </button>
        </h3>
        <PropertyMetadataStatus property={property} />
        <div className="price-line">
          <strong>
            {property.priceEth} <small>ETH</small>
          </strong>
          <span>
            per token{property.sample ? " · illustrative" : " · test ETH"}
          </span>
        </div>
        <SubscriptionProgress property={property} />
        <div className="card-foot">
          <span>
            {property.available} / {property.total} available
          </span>
          <button
            className="text-button"
            onClick={() => onSelect(property.id)}
            aria-label={`View ${property.name}`}
          >
            View property <Icon name="arrowUpRight" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
