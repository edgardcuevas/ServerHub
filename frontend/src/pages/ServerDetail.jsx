import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getServerById,
  getServerAgent,
  getServerMetrics,
  getLatestMetrics
} from "../services/serverService";
import { createRegistrationKey, getKeys } from "../services/registrationKeyService";
import AppShell from "../components/layout/AppShell";
import StatusDot from "../components/ui/StatusDot";
import StatCard from "../components/dashboard/StatCard";
import MetricsChart from "../components/servers/MetricsChart";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import AdminSessionButton from "../components/servers/AdminSessionButton";

function ServerDetail() {
  const { id } = useParams();

  const [server, setServer] = useState(null);
  const [agent, setAgent] = useState(null);
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [registrationKey, setRegistrationKey] = useState(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyError, setKeyError] = useState("");
    const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [keysHistory, setKeysHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const showToast = useToast();

  useEffect(() => {

  async function cargar() {

    try {

      const token = localStorage.getItem("token");

      const [serverDatos, agentDatos, latestDatos, metricsDatos] =
        await Promise.all([
          getServerById(token, id),
          getServerAgent(token, id),
          getLatestMetrics(token, id),
          getServerMetrics(token, id)
        ]);

      if (serverDatos.success) setServer(serverDatos.server);
      if (agentDatos.success) setAgent(agentDatos.agent);
      if (latestDatos.success) setLatest(latestDatos.data);
      if (metricsDatos.success) setHistory(metricsDatos.metrics || []);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  async function refrescarEstado() {

    try {

      const token = localStorage.getItem("token");

      const [agentDatos, latestDatos] = await Promise.all([
        getServerAgent(token, id),
        getLatestMetrics(token, id)
      ]);

      if (agentDatos.success) setAgent(agentDatos.agent);
      if (latestDatos.success) setLatest(latestDatos.data);

    } catch (error) {

      console.error(error);

    }

  }

  cargar();

  const intervalo = setInterval(refrescarEstado, 15000);

  return () => clearInterval(intervalo);

}, [id]);

  async function regenerarClave() {

    setGeneratingKey(true);
    setKeyError("");

    try {

      const token = localStorage.getItem("token");

      const datos = await createRegistrationKey(token, id);

      if (datos.success) {
        setRegistrationKey(datos.key.registration_key);
        setCopied(false);
      } else {
        setKeyError(datos.message || "No se pudo generar la clave");
      }

    } catch (error) {

      console.error(error);
      setKeyError("No se pudo conectar con el servidor");

    } finally {

      setGeneratingKey(false);

    }

  }

function copiarClave() {
  navigator.clipboard.writeText(registrationKey);
  setCopied(true);
  showToast("Clave copiada al portapapeles");
  setTimeout(() => setCopied(false), 2000);
}

async function verHistorialClaves() {

  setShowHistory(true);
  setLoadingHistory(true);
  setHistoryError("");

  try {

    const token = localStorage.getItem("token");
    const datos = await getKeys(token);

    if (!datos.success) throw new Error(datos.message || "No se pudo cargar el historial");

    const claves = (datos.keys || []).filter(
      (k) => String(k.server_id) === String(id)
    );

    setKeysHistory(claves);

  } catch (error) {

    console.error(error);
    setHistoryError(error.message || "No se pudo cargar el historial");

  } finally {

    setLoadingHistory(false);

  }

}

  const online = latest?.connectionStatus === "online";
  const latestMetrics = latest?.metrics;

  // El backend entrega lo más reciente primero; para el gráfico
  // necesitamos orden cronológico (de más viejo a más nuevo).
  const chronological = [...history].reverse();
  const cpuHistory = chronological.map((m) => Number(m.cpu_usage));
  const ramHistory = chronological.map((m) => Number(m.ram_usage));
  const diskHistory = chronological.map((m) => Number(m.disk_usage));

  return (
    <AppShell>
      <Link to="/dashboard" className="back-link">
        ← Volver al dashboard
      </Link>

      {loading && (
  <>
    <section className="section detail-head">
      <div>
        <Skeleton style={{ width: "160px", height: "13px", marginBottom: "10px" }} />
        <Skeleton style={{ width: "220px", height: "22px" }} />
      </div>
    </section>

    <section className="section">
      <div className="stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card stat-card--skeleton">
            <Skeleton style={{ width: "60%", height: "11px" }} />
            <Skeleton style={{ width: "40%", height: "24px" }} />
          </div>
        ))}
      </div>
    </section>
  </>
)}

      {!loading && !server && (
        <div className="empty-state">
          <strong>No encontramos este servidor</strong>
          Puede que haya sido eliminado.
        </div>
      )}

      {server && (
        <>
          <section className="section detail-head">
            <div>
              <p className="section__eyebrow">Servidor</p>
              <h2 className="detail-head__name">
                <StatusDot active={online} />
                {server.name}
              </h2>
              {server.description && (
                <p className="detail-head__desc">{server.description}</p>
              )}
            </div>

            <div className="detail-head__actions">
              <span className="server-card__status">
                {online ? "En línea" : "Sin conexión"}
              </span>
              <AdminSessionButton serverId={id} />
            </div>
          </section>

          <section className="section">
            <div className="stat-grid">
              <StatCard
                label="CPU actual"
                value={latestMetrics ? Number(latestMetrics.cpu_usage) : "—"}
                unit={latestMetrics ? "%" : ""}
                progress={
                  latestMetrics ? Number(latestMetrics.cpu_usage) : undefined
                }
              />
              <StatCard
                label="RAM actual"
                value={latestMetrics ? Number(latestMetrics.ram_usage) : "—"}
                unit={latestMetrics ? "%" : ""}
                progress={
                  latestMetrics ? Number(latestMetrics.ram_usage) : undefined
                }
              />
              <StatCard
                label="Disco actual"
                value={latestMetrics ? Number(latestMetrics.disk_usage) : "—"}
                unit={latestMetrics ? "%" : ""}
                progress={
                  latestMetrics ? Number(latestMetrics.disk_usage) : undefined
                }
              />
              <StatCard
                label="Versión del agente"
                value={agent?.version || "—"}
              />
            </div>
          </section>

          {!agent && (
            <section className="section">
              <div className="section__head">
                <div>
                  <p className="section__eyebrow">Vinculación</p>
                  <h2 className="section__title">Agente</h2>
                </div>

                <Button
                  variant="ghost"
                  onClick={regenerarClave}
                  disabled={generatingKey}
                >
                  {generatingKey ? "Generando..." : "Generar clave de vinculación"}
                </Button>
              </div>

              {keyError && (
                <div className="sh-alert" role="alert">
                  {keyError}
                </div>
              )}              {registrationKey && (
                <>
                  <p className="modal__sub">
                    Usa esta clave para vincular el agente. Vence en 24 horas.
                  </p>
                  <div className="key-box">
                    <span className="key-box__value">{registrationKey}</span>
                    <Button type="button" variant="ghost" onClick={copiarClave}>
                      {copied ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </>
              )}

              <div style={{ marginTop: "1rem" }}>
                <Button
                  variant="ghost"
                  className="sh-btn--sm"
                  onClick={verHistorialClaves}
                  disabled={loadingHistory}
                >
                  {loadingHistory
                    ? "Cargando..."
                    : showHistory
                    ? "Actualizar historial"
                    : "Ver claves generadas"}
                </Button>
              </div>

              {historyError && (
                <div className="sh-alert" role="alert">
                  {historyError}
                </div>
              )}

              {showHistory && !loadingHistory && (
                keysHistory.length === 0 ? (
                  <div className="empty-state">
                    <strong>Sin claves</strong>
                    No se generaron claves para este servidor todavía.
                  </div>
                ) : (
                  <div className="file-list">
                    {keysHistory.map((clave) => {
                      const vencida = new Date(clave.expires_at) < new Date();
                      const estado = clave.is_used
                        ? "Usada"
                        : vencida
                        ? "Vencida"
                        : "Vigente";

                      return (
                        <div className="file-row" key={clave.id}>
                          <div className="file-row__info">
                            <span className="file-row__name">{clave.registration_key}</span>
                            <span
                              className={`status-pill${
                                estado === "Vigente" ? " status-pill--active" : " status-pill--inactive"
                              }`}
                            >
                              {estado}
                            </span>
                          </div>
                          <span className="modal__sub" style={{ marginBottom: 0 }}>
                            Vence: {new Date(clave.expires_at).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </section>
          )}

          <section className="section">
            <p className="section__eyebrow">Historial reciente</p>
            <div className="metrics-grid">
              <MetricsChart
                label="CPU"
                values={cpuHistory}
                current={cpuHistory[cpuHistory.length - 1]}
              />
              <MetricsChart
                label="RAM"
                values={ramHistory}
                current={ramHistory[ramHistory.length - 1]}
              />
              <MetricsChart
                label="Disco"
                values={diskHistory}
                current={diskHistory[diskHistory.length - 1]}
              />
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

export default ServerDetail;