const colors = [
  "#16856a",
  "#14283f",
  "#8eb9ab",
  "#c4a165",
  "#8297b3",
  "#796b8d",
];

export default function PortfolioAllocation({ allocation }) {
  let offset = 0;
  return (
    <section className="panel allocation-panel">
      <div className="section-title">
        <div>
          <h2>Property allocation</h2>
          <p>By value at listing prices</p>
        </div>
        <span className="badge neutral">Reference only</span>
      </div>
      <div className="allocation-content">
        <div className="allocation-chart">
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label="Property allocation based on token holdings multiplied by listing prices"
          >
            <circle
              cx="80"
              cy="80"
              r="62"
              fill="none"
              stroke="#edf1ed"
              strokeWidth="15"
            />
            {allocation.map((item, i) => {
              const start = offset;
              offset += item.weight;
              return (
                <circle
                  key={item.id}
                  cx="80"
                  cy="80"
                  r="62"
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth="15"
                  pathLength="100"
                  strokeDasharray={`${item.weight} ${100 - item.weight}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 80 80)"
                >
                  <title>
                    {item.name}: {item.percentage}%
                  </title>
                </circle>
              );
            })}
          </svg>
          <div>
            <strong>{allocation.length}</strong>
            <span>{allocation.length === 1 ? "property" : "properties"}</span>
          </div>
        </div>
        <ul className="allocation-legend">
          {allocation.map((item, i) => (
            <li key={item.id}>
              <span
                className="legend-dot"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span>{item.name}</span>
              <strong>{item.percentage}%</strong>
            </li>
          ))}
        </ul>
      </div>
      <p className="footnote">
        An allocation snapshot, not performance or market value. No resale or
        redemption price is implied.
      </p>
    </section>
  );
}
