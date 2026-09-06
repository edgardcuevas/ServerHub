import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createAdminSession,
  getStoredAdminSession,
  setStoredAdminSession
} from "../../services/adminSessionService";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";

function AdminSessionButton({ serverId }) {

  const [showUnlock, setShowUnlock] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const navigate = useNavigate();

  function irAlPanel() {
    navigate(`/servers/${serverId}/admin`);
  }

  function alHacerClick() {
    if (getStoredAdminSession(serverId)) {
      irAlPanel();
      return;
    }

    setShowUnlock(true);
  }

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

      setStoredAdminSession(serverId, {
        token: datos.token,
        expiresAt: datos.expiresAt
      });

      setShowUnlock(false);
      irAlPanel();

    } catch (error) {

      console.error(error);
      setUnlockError("No se pudo conectar con el servidor");

    } finally {

      setUnlocking(false);

    }

  }

  return (
    <>
      <Button variant="ghost" onClick={alHacerClick}>
        Panel administrativo
      </Button>

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
    </>
  );
}

export default AdminSessionButton;