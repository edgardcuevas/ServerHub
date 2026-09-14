function FleetRing({ online, total }) {

  const tieneServidores = total > 0;
  const porcentaje = tieneServidores ? Math.round((online / total) * 100) : 0;
  const offline = total - online;

  const colorRestante = offline > 0 ? "var(--danger)" : "var(--line)";

  return (
    <div className="fleet-ring">
      <div
        className="fleet-ring__circle"
        style={{
          background: tieneServidores
            ? `conic-gradient(var(--signal) ${porcentaje * 3.6}deg, ${colorRestante} 0deg)`
            : "var(--line)"
        }}
      >
        <div className="fleet-ring__hole">
          <span className="fleet-ring__value">
            {tieneServidores ? `${online}/${total}` : "—"}
          </span>
          <span className="fleet-ring__label">
            {tieneServidores ? "en línea" : "sin servidores"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default FleetRing;