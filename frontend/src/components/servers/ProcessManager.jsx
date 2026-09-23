import { useState } from "react";
import { waitForCommand } from "../../services/fileService";
import { listProcesses, killProcess } from "../../services/systemService";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import ProcessDetailsModal from "./ProcessDetailsModal";
import { useToast } from "../ui/Toast";

function ProcessManager({ serverId, adminToken }) {

  const [processes, setProcesses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [working, setWorking] = useState(null);
  const [confirmingKill, setConfirmingKill] = useState(null);
  const [detalleProceso, setDetalleProceso] = useState(null);

  const showToast = useToast();
  const token = localStorage.getItem("token");

  async function cargar() {

    setLoading(true);
    setError("");

    try {

      const datos = await listProcesses(token, adminToken, serverId);

      if (!datos.success) throw new Error(datos.message || "No se pudo listar los procesos");

      const resultado = await waitForCommand(token, adminToken, serverId, datos.command.id);

      setProcesses(resultado.processes || []);
      setLoaded(true);

    } catch (err) {

      console.error(err);
      setError(err.message || "No se pudo listar los procesos");

    } finally {

      setLoading(false);

    }

  }

  async function matarProceso(pid) {

    setWorking(pid);

    try {

      const datos = await killProcess(token, adminToken, serverId, pid);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Proceso terminado");
      setConfirmingKill(null);
      cargar();

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo terminar el proceso", "danger");

    } finally {

      setWorking(null);

    }

  }

  const procesosFiltrados = processes.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
        <section className="section">
      <div className="section__head">
        <h2 className="section__title">Procesos</h2>
        <Button variant="ghost" className="sh-btn--sm" onClick={cargar} disabled={loading}>
          {loaded ? "Refrescar" : "Cargar procesos"}
        </Button>
      </div>

      {loaded && (
        <div className="file-manager__search">
          <input
            type="text"
            className="sh-field__input"
            placeholder="Buscar proceso..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {error && <div className="sh-alert" role="alert">{error}</div>}

      {!loaded && !loading && !error && (
        <div className="empty-state">
          <strong>Sin cargar</strong>
          Los procesos no se listan automáticamente. Tocá "Cargar procesos" para verlos.
        </div>
      )}

      {loading ? (
        <p className="modal__sub" style={{ marginBottom: 0 }}>Cargando...</p>
      ) : loaded && procesosFiltrados.length === 0 ? (
        <div className="empty-state">
          <strong>{searchTerm ? "Sin resultados" : "Sin procesos"}</strong>
          {searchTerm
            ? "No encontramos procesos que coincidan con la búsqueda."
            : "No se encontraron procesos."}
        </div>
      ) : loaded && (
        <div className="file-list file-list--scroll">
          {procesosFiltrados.map((proceso) => (
            <div className="file-row" key={proceso.pid}>
              <div className="file-row__info">
                <span className="file-row__name">{proceso.name}</span>
                <span className="modal__sub" style={{ marginBottom: 0 }}>PID {proceso.pid}</span>
              </div>

                            <div className="file-row__actions">
                <Button
                  variant="ghost"
                  className="sh-btn--sm"
                  onClick={() => setDetalleProceso(proceso)}
                  disabled={!!working}
                >
                  Detalles
                </Button>
                <Button
                  variant="ghost"
                  className="sh-btn--sm"
                  onClick={() => setConfirmingKill(proceso)}
                  disabled={!!working}
                >
                  {working === proceso.pid ? "Terminando..." : "Terminar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

            {confirmingKill && (
        <ConfirmDialog
          title="Terminar proceso"
          message={`¿Seguro que querés terminar "${confirmingKill.name}" (PID ${confirmingKill.pid})? Podés perder trabajo sin guardar en ese programa.`}
          confirmLabel="Terminar"
          loading={working === confirmingKill.pid}
          onCancel={() => setConfirmingKill(null)}
          onConfirm={() => matarProceso(confirmingKill.pid)}
        />
      )}

      {detalleProceso && (
        <ProcessDetailsModal
          serverId={serverId}
          adminToken={adminToken}
          proceso={detalleProceso}
          onClose={() => setDetalleProceso(null)}
          onCambio={() => {
            setDetalleProceso(null);
            cargar();
          }}
        />
      )}
    </section>
  );
}

export default ProcessManager;