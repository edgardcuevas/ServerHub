import { useState } from "react";
import { waitForCommand } from "../../services/fileService";
import { rebootServer } from "../../services/systemService";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

function SystemActions({ serverId, adminToken }) {

  const [confirmingReboot, setConfirmingReboot] = useState(false);
  const [working, setWorking] = useState(false);
  const showToast = useToast();
  const token = localStorage.getItem("token");

  async function reiniciarServidor() {

    setWorking(true);

    try {

      const datos = await rebootServer(token, adminToken, serverId);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Reinicio del servidor enviado");
      setConfirmingReboot(false);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo reiniciar el servidor", "danger");

    } finally {

      setWorking(false);

    }

  }

  return (
    <section className="section">
      <div className="section__head">
        <h2 className="section__title">Sistema</h2>
        <Button
          variant="ghost"
          className="sh-btn--sm"
          onClick={() => setConfirmingReboot(true)}
          disabled={working}
        >
          Reiniciar servidor
        </Button>
      </div>

      {confirmingReboot && (
        <ConfirmDialog
          title="Reiniciar servidor"
          message="¿Seguro que querés reiniciar este servidor? Se cerrarán todas las conexiones y el agente va a tardar un momento en volver a estar disponible."
          confirmLabel="Reiniciar"
          loading={working}
          onCancel={() => setConfirmingReboot(false)}
          onConfirm={reiniciarServidor}
        />
      )}
    </section>
  );
}

export default SystemActions;