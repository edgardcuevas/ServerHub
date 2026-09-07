import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getActiveAlerts, getAlerts } from "../../services/alertService";
import { getServers } from "../../services/serverService";
import Button from "../ui/Button";

const ALERT_LABELS = {
  CPU_HIGH: "CPU alta",
  RAM_HIGH: "RAM alta",
  DISK_HIGH: "Disco alto",
  AGENT_OFFLINE: "Agente sin conexión"
};

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleString();
}

function Alerts() {

  const [alerts, setAlerts] = useState([]);
  const [servers, setServers] = useState({});
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function cargar(incluirResueltas) {

    setLoading(true);

    try {

      const token = localStorage.getItem("token");

      const [alertsDatos, serversDatos] = await Promise.all([
        incluirResueltas ? getAlerts(token) : getActiveAlerts(token),
        getServers(token)
      ]);

      if (alertsDatos.success) setAlerts(alertsDatos.alerts || []);

      if (serversDatos.success) {
        const mapa = {};
        for (const server of serversDatos.servers || []) {
          mapa[server.id] = server.name;
        }
        setServers(mapa);
      }

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {
    cargar(showResolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResolved]);

  return (
    <section className="section">
      <div className="section__head">
        <div>
          <p className="section__eyebrow">Monitoreo</p>
          <h2 className="section__title">Alertas</h2>
        </div>

        <Button
          variant="ghost"
          className="sh-btn--sm"
          onClick={() => setShowResolved((v) => !v)}
        >
          {showResolved ? "Ver solo activas" : "Ver historial"}
        </Button>
      </div>

      {loading ? (
        <p className="modal__sub" style={{ marginBottom: 0 }}>Cargando...</p>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <strong>{showResolved ? "Sin alertas" : "Todo tranquilo"}</strong>
          {showResolved
            ? "Todavía no se registró ninguna alerta."
            : "No hay alertas activas en este momento."}
        </div>
      ) : (
        <div className="file-list file-list--scroll">
          {alerts.map((alert) => (
            <div
              className="file-row"
              key={alert.id}
              onClick={() => navigate(`/servers/${alert.server_id}`)}
              style={{ cursor: "pointer" }}
            >
              <div className="file-row__info">
                <span
                  className={`status-pill ${alert.is_resolved ? "status-pill--active" : "status-pill--inactive"}`}
                >
                  {alert.is_resolved ? "Resuelta" : ALERT_LABELS[alert.type] || alert.type}
                </span>
                <span className="file-row__name">
                  {servers[alert.server_id] || "Servidor eliminado"} · {alert.message}
                </span>
              </div>

              <span className="file-row__meta">{formatearFecha(alert.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default Alerts;