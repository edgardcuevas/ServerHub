import { useEffect, useState } from "react";
import { waitForCommand } from "../../services/fileService";
import { getServiceDetails, startService, stopService, restartService } from "../../services/serviceService";
import { detectarTecnologia } from "../../utils/techCatalog";
import Button from "../ui/Button";
import TechIcon from "../ui/TechIcon";
import { useToast } from "../ui/Toast";

function ServiceDetailsModal({ serverId, adminToken, service, onClose, onCambio }) {

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [accionando, setAccionando] = useState(null);

  const showToast = useToast();
  const token = localStorage.getItem("token");
  const tech = detectarTecnologia(service.name, "Servicio");

  useEffect(() => {
    cargarDetalle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarDetalle() {

    setLoading(true);
    setError("");

    try {

      const datos = await getServiceDetails(token, adminToken, serverId, service.name);
      if (!datos.success) throw new Error(datos.message || "No se pudo obtener el detalle del servicio");

      const resultado = await waitForCommand(token, adminToken, serverId, datos.command.id);
      setDetalle(resultado);

    } catch (err) {

      console.error(err);
      setError(err.message || "No se pudo obtener el detalle del servicio");

    } finally {

      setLoading(false);

    }

  }

  async function ejecutarAccion(accion) {

    setAccionando(accion);

    try {

      const funcion =
        accion === "start" ? startService :
        accion === "stop" ? stopService :
        restartService;

      const datos = await funcion(token, adminToken, serverId, service.name);
      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast(
        accion === "start" ? "Servicio iniciado" :
        accion === "stop" ? "Servicio detenido" :
        "Servicio reiniciado"
      );

      onCambio();
      await cargarDetalle();

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo completar la acción", "danger");

    } finally {

      setAccionando(null);

    }

  }

  const activo = detalle && ["ACTIVE", "RUNNING"].includes(String(detalle.status || "").toUpperCase());

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>

        <div className="tech-header">
          <div className="tech-header__icon">
            <TechIcon categoria={tech.categoria} />
          </div>
          <div className="tech-header__body">
            <h3 className="tech-header__title">{detalle?.displayName || service.name}</h3>
            <p className="tech-header__desc">
              {tech.etiqueta} · {detalle?.description || tech.descripcion}
            </p>
          </div>
        </div>

        {error && <div className="sh-alert" role="alert">{error}</div>}

        {loading ? (
          <p className="modal__sub">Cargando detalle...</p>
        ) : (
          <>
            <p className="section__eyebrow">Especificaciones</p>
            <div className="spec-grid">
                            {detalle?.subStatus && (
                <div className="spec-item">
                  <span className="spec-item__label">Sub-estado</span>
                  <span className="spec-item__value">{detalle.subStatus}</span>
                </div>
              )}
              <div className="spec-item">
                <span className="spec-item__label">Estado</span>
                <span className="spec-item__value">{detalle?.status || "—"}</span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">Sub-estado</span>
                <span className="spec-item__value">{detalle?.subStatus || "—"}</span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">Modo de inicio</span>
                <span className="spec-item__value">{detalle?.startMode || "—"}</span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">Habilitado</span>
                <span className="spec-item__value">{detalle?.enabled ? "Sí" : "No"}</span>
              </div>
            </div>
          </>
        )}

        <div className="modal__actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          {!loading && (
            activo ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => ejecutarAccion("restart")}
                  disabled={!!accionando}
                >
                  {accionando === "restart" ? "Reiniciando..." : "Reiniciar"}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => ejecutarAccion("stop")}
                  disabled={!!accionando}
                >
                  {accionando === "stop" ? "Deteniendo..." : "Detener"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={() => ejecutarAccion("start")}
                disabled={!!accionando}
              >
                {accionando === "start" ? "Iniciando..." : "Iniciar"}
              </Button>
            )
          )}
        </div>

      </div>
    </div>
  );
}

export default ServiceDetailsModal;