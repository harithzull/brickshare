import Icon from "./Icon";
import { subscription } from "../lib/marketplace";

export function Button({
  children,
  variant = "primary",
  className = "",
  icon,
  ...props
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
      {icon && <Icon name={icon} size={17} />}
    </button>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon = "building",
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <span className="empty-icon">
        <Icon name={icon} size={27} />
      </span>
      <h2>{title}</h2>
      <div className="empty-description">{children}</div>
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  note,
  icon = "chart",
  accent = false,
}) {
  return (
    <div className={`stat-card ${accent ? "accent" : ""}`}>
      <div className="stat-label">
        <span>{label}</span>
        <Icon name={icon} size={19} />
      </div>
      <div className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {note && <p>{note}</p>}
    </div>
  );
}

export function PropertyStatusBadge({ property, showSource = false }) {
  if (showSource && property.sample)
    return (
      <span className="badge sample">
        <span className="badge-dot" />
        Fictional sample
      </span>
    );
  const state = !property.active
    ? "inactive"
    : property.available === "0"
    ? "sold-out"
    : "available";
  return (
    <span className={`badge ${state}`}>
      <span className="badge-dot" />
      {state === "inactive"
        ? "Inactive"
        : state === "sold-out"
        ? "Sold out"
        : "Available"}
    </span>
  );
}

export function SubscriptionProgress({ property }) {
  const progress = subscription(property);
  return (
    <div className="subscription">
      <div className="progress-label">
        <span>Token supply subscribed</span>
        <strong>{progress}%</strong>
      </div>
      <progress
        max="100"
        value={progress}
        aria-label={`${property.name}: ${progress}% of token supply subscribed`}
      />
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
  title,
  action,
  onDismiss,
  role = "status",
}) {
  return (
    <div className={`notice ${tone}`} role={role}>
      <Icon
        name={tone === "error" || tone === "warning" ? "alert" : "info"}
        size={19}
      />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
      {action}
      {onDismiss && (
        <button
          className="icon-button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <Icon name="close" size={17} />
        </button>
      )}
    </div>
  );
}

export function LoadingSkeleton({ count = 3, variant = "properties" }) {
  return (
    <div
      className={variant === "properties" ? "property-grid" : "stats-grid"}
      role="status"
      aria-label="Loading blockchain data"
    >
      <span className="sr-only">Loading blockchain data…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton-card ${variant}`} aria-hidden="true">
          <div className="skeleton-image" />
          <div className="skeleton-lines">
            <span />
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RiskNote({ compact = false }) {
  return (
    <div className={`risk-note ${compact ? "compact" : ""}`}>
      <Icon name="info" size={18} />
      <p>
        {compact
          ? "Test ETH only. Tokens record application balances, not legal ownership of a property."
          : "Understand what you’re exploring. This test-network prototype does not establish legal property ownership, pay rental income, or offer refunds or guaranteed returns. Listing-price values are references, not market valuations."}
      </p>
    </div>
  );
}
