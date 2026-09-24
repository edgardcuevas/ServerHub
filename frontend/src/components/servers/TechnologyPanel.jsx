import { useEffect, useState } from "react";
import { waitForCommand } from "../../services/fileService";
import { getTechnologyDiscovery } from "../../services/technologyService";
import { categoriaPorId } from "../../utils/techCatalog";
import Button from "../ui/Button";
import TechIcon from "../ui/TechIcon";

function TechnologyPanel({ serverId, adminToken }) {

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [operatingSystem, setOperatingSystem] = useState(null);
  const [technologies, setTechnologies] = useState([]);

  const token = localStorage.getItem("token");

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function cargar() {

    setLoading(true);
    setError("");

    try {

      const datos = await getTechnologyDiscovery(token, adminToken, serverId);
      if (!datos.success) throw new Error(datos.message || "No se pudo iniciar el descubrimiento");

      const resultado = await waitForCommand(token, adminToken, serverId, datos.command.id, { timeoutMs: 45000 });

      setOperatingSystem(resultado.operatingSystem || null);
      setTechnologies(resultado.technologies || []);

    } catch (err) {

      console.error(err);
      setError(err.message || "No se pudo completar el descubrimiento de tecnologías");

    } finally {

      setLoading(false);

    }

  }

  return (
    <section className="section">
      <div className="file-manager__toolbar">
        <div>
          <h3>Tecnologías</h3>
          {operatingSystem && (
            <p className="modal__sub" style={{ marginBottom: 0 }}>
              {operatingSystem.distro} · {operatingSystem.architecture} · gestor de paquetes: {operatingSystem.packageManager || "desconocido"}
            </p>
          )}
        </div>
        <Button variant="ghost" onClick={cargar} disabled={loading}>
          {loading ? "Buscando..." : "Refrescar"}
        </Button>
      </div>

      {error && <div className="sh-alert" role="alert">{error}</div>}

      {loading ? (
        <p className="modal__sub">Buscando tecnologías instaladas en el servidor (puede tardar unos segundos)...</p>
      ) : technologies.length === 0 ? (
        <div className="empty-state">
          <strong>Sin datos</strong>
          No se pudo obtener información de tecnologías para este servidor.
        </div>
      ) : (
        <div className="tech-grid">
          {technologies.map((tech) => (
            <div key={tech.id} className="tech-card">
              <div className="tech-card__header">
                <div className="tech-card__icon">
                  <TechIcon categoria={categoriaPorId(tech.id)} size={22} />
                </div>
                <div className="tech-card__title">
                  <strong>{tech.name}</strong>
                  <span className={`status-pill ${tech.installed ? "status-pill--active" : "status-pill--inactive"}`}>
                    {tech.installed ? "Instalado" : "No instalado"}
                  </span>
                </div>
              </div>

              <div className="tech-card__meta">
                {tech.version && <p>Versión: <strong>{tech.version}</strong></p>}
                <p>Ejecutable en PATH: {tech.executableAvailable ? "Sí" : "No"}</p>
                {tech.service?.name && (
                  <p>Servicio: <strong>{tech.service.name}</strong> ({tech.service.status || "sin estado"})</p>
                )}
                {tech.detectionNotes && tech.detectionNotes.length > 0 && (
                  <p className="tech-card__note">{tech.detectionNotes.join(" ")}</p>
                )}
              </div>

              {tech.installation && (
                <div className="tech-card__install">
                  <p className="section__eyebrow">{tech.installation.title || "Cómo instalar"}</p>
                  {tech.installation.description && (
                    <p className="tech-card__note">{tech.installation.description}</p>
                  )}
                  {tech.installation.commands && tech.installation.commands.length > 0 && (
                    <pre className="code-block">{tech.installation.commands.join("\n")}</pre>
                  )}
                  {tech.installation.notes && tech.installation.notes.length > 0 && (
                    <ul className="tech-card__notes-list">
                      {tech.installation.notes.map((nota, i) => (
                        <li key={i}>{nota}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );

}

export default TechnologyPanel;