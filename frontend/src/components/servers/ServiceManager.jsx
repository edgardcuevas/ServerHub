import { useEffect, useState } from "react";
import { waitForCommand } from "../../services/fileService";
import { listServices, restartService, startService, stopService } from "../../services/serviceService";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import StatusDot from "../ui/StatusDot";
import { useToast } from "../ui/Toast";

function estaActivo(service) {
  if (service.active) {
    return service.active.toLowerCase() === "active";
  }
  return String(service.status || "").toUpperCase() === "RUNNING";
}

function ServiceManager({ serverId, adminToken }) {

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [working, setWorking] = useState(null);
  const [confirmingStop, setConfirmingStop] = useState(null);
  const [confirmingRestart, setConfirmingRestart] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const showToast = useToast();
  const token = localStorage.getItem("token");

  async function cargar() {

    setLoading(true);
    setError("");

    try {

      const datos = await listServices(token, adminToken, serverId);

      if (!datos.success) throw new Error(datos.message || "No se pudo listar los servicios");

      const resultado = await waitForCommand(token, adminToken, serverId, datos.command.id);

      setServices(resultado.services || []);

    } catch (err) {

      console.error(err);
      setError(err.message || "No se pudo listar los servicios");

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ejecutarAccion(serviceName, accion) {

    setWorking(serviceName);

    try {

      const funcion =
        accion === "start" ? startService :
        accion === "stop" ? stopService :
        restartService;

      const datos = await funcion(token, adminToken, serverId, serviceName);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast(
        accion === "start" ? "Servicio iniciado" :
        accion === "stop" ? "Servicio detenido" :
        "Servicio reiniciado"
      );

      setConfirmingStop(null);
      setConfirmingRestart(null);
      cargar();

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo completar la acción", "danger");

    } finally {

      setWorking(null);

    }

  }

  const serviciosFiltrados = services
  .filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
  .filter((s) => {
    if (statusFilter === "all") return true;
    const activo = estaActivo(s);
    return statusFilter === "active" ? activo : !activo;
  });

  return (
    <section className="section section--admin">
      <div className="section__head">
        <div>
          <p className="section__eyebrow">Panel administrativo</p>
          <h2 className="section__title">Servicios</h2>
        </div>
        <Button variant="ghost" className="sh-btn--sm" onClick={cargar} disabled={loading}>
          Refrescar
        </Button>
      </div>

      <div className="file-manager__search">
        <input
          type="text"
          className="sh-field__input"
          placeholder="Buscar servicio..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filter-pills">
  <button
    type="button"
    className={`filter-pill${statusFilter === "all" ? " filter-pill--active" : ""}`}
    onClick={() => setStatusFilter("all")}
  >
    Todos
  </button>
  <button
    type="button"
    className={`filter-pill${statusFilter === "active" ? " filter-pill--active" : ""}`}
    onClick={() => setStatusFilter("active")}
  >
    Activos
  </button>
  <button
    type="button"
    className={`filter-pill${statusFilter === "inactive" ? " filter-pill--active" : ""}`}
    onClick={() => setStatusFilter("inactive")}
  >
    Inactivos
  </button>
</div>

      {error && <div className="sh-alert" role="alert">{error}</div>}

      {loading ? (
        <p className="modal__sub" style={{ marginBottom: 0 }}>Cargando...</p>
      ) : serviciosFiltrados.length === 0 ? (
        <div className="empty-state">
          <strong>{searchTerm ? "Sin resultados" : "Sin servicios"}</strong>
          {searchTerm
            ? "No encontramos servicios que coincidan con la búsqueda."
            : "No se encontraron servicios."}
        </div>
      ) : (
        <div className="file-list file-list--scroll">
          {serviciosFiltrados.map((service) => {
            const activo = estaActivo(service);
            const enAccion = working === service.name;

            return (
              <div className="file-row" key={service.name}>
                <div className="file-row__info">
                  <StatusDot active={activo} />
                  <span className="file-row__name">{service.name}</span>
                  <span className={`status-pill${activo ? " status-pill--active" : " status-pill--inactive"}`}> {activo ? "Activo" : "Inactivo"}</span>
                </div>

                <div className="file-row__actions">
                  {activo ? (
                    <Button
                      variant="ghost"
                      className="sh-btn--sm"
                      onClick={() => setConfirmingStop(service)}
                      disabled={!!working}
                    >
                      Detener
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="sh-btn--sm"
                      onClick={() => ejecutarAccion(service.name, "start")}
                      disabled={!!working}
                    >
                      {enAccion ? "Iniciando..." : "Iniciar"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="sh-btn--sm"
                    onClick={() => setConfirmingRestart(service)}
                    disabled={!!working}
                  >
                    Reiniciar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmingStop && (
        <ConfirmDialog
          title="Detener servicio"
          message={`¿Seguro que querés detener "${confirmingStop.name}"?`}
          confirmLabel="Detener"
          loading={working === confirmingStop.name}
          onCancel={() => setConfirmingStop(null)}
          onConfirm={() => ejecutarAccion(confirmingStop.name, "stop")}
        />
      )}

      {confirmingRestart && (
        <ConfirmDialog
          title="Reiniciar servicio"
          message={`¿Seguro que querés reiniciar "${confirmingRestart.name}"?`}
          confirmLabel="Reiniciar"
          loading={working === confirmingRestart.name}
          onCancel={() => setConfirmingRestart(null)}
          onConfirm={() => ejecutarAccion(confirmingRestart.name, "restart")}
        />
      )}
    </section>
  );
}

export default ServiceManager;