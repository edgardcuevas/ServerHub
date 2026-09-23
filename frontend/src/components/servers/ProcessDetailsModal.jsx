import { useEffect, useState } from "react";
import { waitForCommand } from "../../services/fileService";
import { getProcessDetails, getProcessTree, classifyProcess, killProcess } from "../../services/systemService";
import { restartService } from "../../services/serviceService";
import { detectarTecnologia } from "../../utils/techCatalog";
import Button from "../ui/Button";
import TechIcon from "../ui/TechIcon";
import { useToast } from "../ui/Toast";

function formatearBytes(bytes) {
  const valor = Number(bytes) || 0;
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

function buscarNodo(nodos, pid) {
  for (const nodo of nodos || []) {
    if (nodo.pid === pid) return nodo;
    const encontrado = buscarNodo(nodo.children, pid);
    if (encontrado) return encontrado;
  }
  return null;
}

function NodoArbol({ nodo }) {
  const [expandido, setExpandido] = useState(true);
  const tieneHijos = nodo.children && nodo.children.length > 0;

  return (
    <div className="process-tree__node">
      <div className="process-tree__row">
        {tieneHijos ? (
          <button
            type="button"
            className="process-tree__toggle"
            onClick={() => setExpandido((v) => !v)}
          >
            {expandido ? "▾" : "▸"}
          </button>
        ) : (
          <span className="process-tree__toggle process-tree__toggle--empty" />
        )}
        <span className="process-tree__name">{nodo.name || "(sin nombre)"}</span>
        <span className="process-tree__pid">PID {nodo.pid}</span>
        <span className="process-tree__cpu">{Number(nodo.cpu || 0).toFixed(1)}% CPU</span>
      </div>

      {tieneHijos && expandido && (
        <div className="process-tree__children">
          {nodo.children.map((hijo) => (
            <NodoArbol key={hijo.pid} nodo={hijo} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProcessDetailsModal({ serverId, adminToken, proceso, onClose, onCambio }) {

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detalles, setDetalles] = useState(null);
  const [clasificacion, setClasificacion] = useState(null);
  const [subProcesos, setSubProcesos] = useState([]);
  const [accionando, setAccionando] = useState(null);

  const showToast = useToast();
  const token = localStorage.getItem("token");
  const tech = detectarTecnologia(proceso.name, "Proceso");

  useEffect(() => {
    cargarDetalle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarDetalle() {

    setLoading(true);
    setError("");

    try {

      const [datosDetalles, datosClasificacion, datosArbol] = await Promise.all([
        getProcessDetails(token, adminToken, serverId, proceso.pid),
        classifyProcess(token, adminToken, serverId, proceso.pid),
        getProcessTree(token, adminToken, serverId)
      ]);

      if (!datosDetalles.success) throw new Error(datosDetalles.message || "No se pudieron obtener los detalles");
      if (!datosClasificacion.success) throw new Error(datosClasificacion.message || "No se pudo clasificar el proceso");
      if (!datosArbol.success) throw new Error(datosArbol.message || "No se pudo obtener el árbol de procesos");

      const [resultadoDetalles, resultadoClasificacion, resultadoArbol] = await Promise.all([
        waitForCommand(token, adminToken, serverId, datosDetalles.command.id),
        waitForCommand(token, adminToken, serverId, datosClasificacion.command.id),
        waitForCommand(token, adminToken, serverId, datosArbol.command.id)
      ]);

      setDetalles(resultadoDetalles);
      setClasificacion(resultadoClasificacion);
      setSubProcesos(buscarNodo(resultadoArbol.roots, proceso.pid)?.children || []);

    } catch (err) {

      console.error(err);
      setError(err.message || "No se pudo cargar el detalle del proceso");

    } finally {

      setLoading(false);

    }

  }

  async function matarProceso() {

    setAccionando("kill");

    try {

      const datos = await killProcess(token, adminToken, serverId, proceso.pid);
      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Proceso terminado");
      onCambio();

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo terminar el proceso", "danger");

    } finally {

      setAccionando(null);

    }

  }

  async function reiniciarServicioAsociado() {

    if (!clasificacion?.service?.name) return;

    setAccionando("restart");

    try {

      const datos = await restartService(token, adminToken, serverId, clasificacion.service.name);
      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Servicio reiniciado");
      onCambio();

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo reiniciar el servicio", "danger");

    } finally {

      setAccionando(null);

    }

  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>

        <div className="tech-header">
          <div className="tech-header__icon">
            <TechIcon categoria={tech.categoria} />
          </div>
          <div className="tech-header__body">
            <h3 className="tech-header__title">{proceso.name}</h3>
            <p className="tech-header__desc">{tech.etiqueta} · {tech.descripcion}</p>
          </div>
        </div>

        {error && <div className="sh-alert" role="alert">{error}</div>}

        {loading ? (
          <p className="modal__sub">Cargando detalle...</p>
        ) : (
          <>
            <p className="section__eyebrow">Especificaciones</p>
            <div className="spec-grid">
              <div className="spec-item">
                <span className="spec-item__label">PID / PPID</span>
                <span className="spec-item__value">{detalles?.pid} / {detalles?.ppid ?? "—"}</span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">Usuario</span>
                <span className="spec-item__value">{detalles?.user || "—"}</span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">Estado</span>
                <span className="spec-item__value">{detalles?.state || "—"}</span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">CPU</span>
                <span className="spec-item__value">{Number(detalles?.cpu || 0).toFixed(1)}%</span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">Memoria</span>
                <span className="spec-item__value">
                  {formatearBytes(detalles?.memory)} ({Number(detalles?.memoryPercent || 0).toFixed(1)}%)
                </span>
              </div>
              <div className="spec-item">
                <span className="spec-item__label">Iniciado</span>
                <span className="spec-item__value">{detalles?.started || "—"}</span>
              </div>
              <div className="spec-item spec-item--wide">
                <span className="spec-item__label">Ruta</span>
                <span className="spec-item__value spec-item__value--mono">{detalles?.path || "—"}</span>
              </div>
              <div className="spec-item spec-item--wide">
                <span className="spec-item__label">Comando</span>
                <span className="spec-item__value spec-item__value--mono">{detalles?.command || "—"}</span>
              </div>
            </div>

            {clasificacion?.source === "SERVICE" && (
              <div className="sh-alert sh-alert--info">
                Este proceso está respaldado por el servicio del sistema <strong>{clasificacion.service.name}</strong>.
                Reiniciarlo va a terminar este proceso y levantar uno nuevo.
              </div>
            )}

            <p className="section__eyebrow">Subprocesos ({subProcesos.length})</p>
            {subProcesos.length === 0 ? (
              <div className="empty-state">
                <strong>Sin subprocesos</strong>
                Este proceso no tiene procesos hijos en este momento.
              </div>
            ) : (
              <div className="process-tree">
                {subProcesos.map((nodo) => (
                  <NodoArbol key={nodo.pid} nodo={nodo} />
                ))}
              </div>
            )}
          </>
        )}

        <div className="modal__actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          {clasificacion?.source === "SERVICE" && (
            <Button
              type="button"
              variant="ghost"
              onClick={reiniciarServicioAsociado}
              disabled={!!accionando}
            >
              {accionando === "restart" ? "Reiniciando..." : "Reiniciar servicio"}
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={matarProceso}
            disabled={!!accionando}
          >
            {accionando === "kill" ? "Terminando..." : "Terminar proceso"}
          </Button>
        </div>

      </div>
    </div>
  );
}

export default ProcessDetailsModal;