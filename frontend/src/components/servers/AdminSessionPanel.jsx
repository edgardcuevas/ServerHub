import { useCallback, useEffect, useState } from "react";
import { createAdminSession, getStoredAdminSession, logoutAdminSession } from "../../services/adminSessionService";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import StatusDot from "../ui/StatusDot";
import { useToast } from "../ui/Toast";

function formatearRestante(ms) {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${segundos.toString().padStart(2, "0")}`;
}

function AdminSessionPanel({ serverId, onSessionChange }) {

  const [session, setSession] = useState(() => getStoredAdminSession(serverId));
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const showToast = useToast();

  const limpiarSesion = useCallback(() => {
    setSession(null);
    onSessionChange?.(null);
  }, [onSessionChange]);

  useEffect(() => {

    if (!session) return;

    function tick() {
      const restante = new Date(session.expiresAt).getTime() - Date.now();

      if (restante <= 0) {
        limpiarSesion();
        showToast("La sesión administrativa expiró", "danger");
        return;
      }

      setRemaining(restante);
    }

    tick();
    const intervalo = setInterval(tick, 1000);

    return () => clearInterval(intervalo);

  }, [session, limpiarSesion, showToast]);

  async function desbloquear(password) {

    setUnlocking(true);
    setUnlockError("");

    try {

      const token = localStorage.getItem("token");
      const datos = await createAdminSession(token, serverId, password);

      if (!datos.success) {
        setUnlockError(datos.message || "Contraseña administrativa incorrecta");
        return;
      }

      const nuevaSesion = { token: datos.token, expiresAt: datos.expiresAt };

      setSession(nuevaSesion);
      onSessionChange?.(nuevaSesion);
      setShowUnlock(false);
      showToast("Acceso administrativo desbloqueado");

    } catch (error) {

      console.error(error);
      setUnlockError("No se pudo conectar con el servidor");

    } finally {

      setUnlocking(false);

    }

  }

  async function cerrarSesion() {

    try {

      const token = localStorage.getItem("token");
      await logoutAdminSession(token, serverId, session.token);

    } catch (error) {

      console.error(error);

    } finally {

      limpiarSesion();
      showToast("Sesión administrativa cerrada");

    }

  }

  return (
    <section className="section">
      <div className="section__head">
        <div>
          <p className="section__eyebrow">Seguridad</p>
          <h2 className="section__title">Acceso administrativo</h2>
        </div>

        {session ? (
          <Button variant="ghost" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setShowUnlock(true)}>
            Desbloquear
          </Button>
        )}
      </div>

      {session ? (
        <div className="admin-session__status">
          <StatusDot active />
          Sesión activa · expira en {formatearRestante(remaining)}
        </div>
      ) : (
        <p className="modal__sub" style={{ marginBottom: 0 }}>
          Necesitás desbloquear el acceso administrativo con la clave del
          servidor para gestionar servicios y archivos.
        </p>
      )}

      {showUnlock && (
        <ConfirmDialog
          title="Acceso administrativo"
          message="Ingresá la clave administrativa del servidor para continuar."
          confirmLabel="Desbloquear"
          loadingLabel="Verificando..."
          loading={unlocking}
          requirePassword
          passwordError={unlockError}
          onCancel={() => {
            setShowUnlock(false);
            setUnlockError("");
          }}
          onConfirm={desbloquear}
        />
      )}
    </section>
  );
}

export default AdminSessionPanel;