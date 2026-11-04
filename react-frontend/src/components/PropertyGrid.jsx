import PropertyCard from "./PropertyCard";

export default function PropertyGrid({ properties, onSelect }) {
  return (
    <div className="property-grid">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
