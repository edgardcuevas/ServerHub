export function levelClass(value) {
  if (value >= 85) return "stat-card__bar-fill--danger";
  if (value >= 60) return "stat-card__bar-fill--warn";
  return "";
}

function StatCard({ label, value, unit, progress }) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>

      <div>
        <span className="stat-card__value">{value}</span>
        {unit && <span className="stat-card__unit">{unit}</span>}
      </div>

      {typeof progress === "number" && (
        <div className="stat-card__bar">
          <div
            className={`stat-card__bar-fill ${levelClass(progress)}`.trim()}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default StatCard;