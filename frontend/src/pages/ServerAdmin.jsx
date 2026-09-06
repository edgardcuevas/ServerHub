import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate, Link } from "react-router-dom";
import { getServerById } from "../services/serverService";
import {
  getStoredAdminSession,
  clearStoredAdminSession,
  logoutAdminSession
} from "../services/adminSessionService";
import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/Button";
import StatusDot from "../components/ui/StatusDot";
import { useToast } from "../components/ui/Toast";
import FileManager from "../components/servers/FileManager";

function formatearRestante(ms) {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${segundos.toString().padStart(2, "0")}`;
}

function ServerAdmin() {
  const { id } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();

  const [session] = useState(() => getStoredAdminSession(id));
  const [server, setServer] = useState(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {

    async function cargarServidor() {
      try {
        const token = localStorage.getItem("token");
        const datos = await getServerById(token, id);
        if (datos.success) setServer(datos.server);
      } catch (error) {
        console.error(error);
      }
    }

    cargarServidor();

  }, [id]);

  useEffect(() => {

    if (!session) return;

    function tick() {
      const restante = new Date(session.expiresAt).getTime() - Date.now();

      if (restante <= 0) {
        clearStoredAdminSession(id);
        showToast("La sesión administrativa expiró", "danger");
        navigate(`/servers/${id}`);
        return;
      }

      setRemaining(restante);
    }

    tick();
    const intervalo = setInterval(tick, 1000);

    return () => clearInterval(intervalo);

  }, [session, id, navigate, showToast]);

  async function cerrarSesion() {

    try {

      const token = localStorage.getItem("token");
      await logoutAdminSession(token, id, session.token);

    } catch (error) {

      console.error(error);

    } finally {

      clearStoredAdminSession(id);
      showToast("Sesión administrativa cerrada");
      navigate(`/servers/${id}`);

    }

  }

  if (!session) {
    return <Navigate to={`/servers/${id}`} replace />;
  }

  return (
    <AppShell>
      <Link to={`/servers/${id}`} className="back-link">
        ← Volver a {server?.name || "el servidor"}
      </Link>

      <section className="section detail-head">
        <div>
          <p className="section__eyebrow">Panel administrativo</p>
          <h2 className="detail-head__name">{server?.name || "Cargando..."}</h2>
        </div>

        <div className="detail-head__actions">
          <div className="admin-session__status">
            <StatusDot active />
            Expira en {formatearRestante(remaining)}
          </div>
          <Button variant="ghost" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </div>
      </section>

        <FileManager serverId={id} adminToken={session.token} />
    </AppShell>
  );
}

export default ServerAdmin;