import { shortAddress } from "../lib/marketplace";
import Icon from "./Icon";

export default function ActivityList({ activity, properties }) {
  return (
    <ul className="activity-list">
      {activity.map((event) => (
        <li key={event.key}>
          <span className={`activity-icon ${event.type.toLowerCase()}`}>
            <Icon
              name={
                event.type === "Sent"
                  ? "arrowUpRight"
                  : event.type === "Purchase"
                  ? "layers"
                  : "arrowLeft"
              }
              size={18}
            />
          </span>
          <div className="activity-body">
            <div className="activity-heading">
              <strong>
                {event.type === "Purchase"
                  ? "Tokens purchased"
                  : event.type === "Sent"
                  ? "Tokens sent"
                  : "Tokens received"}
              </strong>
              <span>
                {event.type === "Sent" ? "−" : "+"}
                {event.amount} <small>tokens</small>
              </span>
            </div>
            <p>
              {properties.find((p) => p.id === event.propertyId)?.name ||
                `Property #${event.propertyId}`}
              {event.cost
                ? ` · ${event.cost} ETH`
                : ` · ${shortAddress(event.counterparty)}`}
            </p>
            <details>
              <summary>Block {event.block} · View transaction</summary>
              <code>{event.hash}</code>
            </details>
          </div>
        </li>
      ))}
    </ul>
  );
}
