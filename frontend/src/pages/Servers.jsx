import { useEffect, useState } from "react";
import { getServers, deleteServer, verifyServerPassword } from "../services/serverService";
import ServerCard from "../components/servers/ServerCard";
import AddServerModal from "../components/servers/AddServerModal";
import EditServerModal from "../components/servers/EditServerModal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";

function Servers() {

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [deletingServer, setDeletingServer] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const showToast = useToast();

  async function cargarServidores() {

    try {

      const token = localStorage.getItem("token");

      const datos = await getServers(token);

      setServers(datos.servers || []);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {

    cargarServidores();

  }, []);

  async function confirmarEliminar(password) {

    setDeleting(true);
    setDeleteError("");

    try {

      const token = localStorage.getItem("token");

      const verificacion = await verifyServerPassword(
        token,
        deletingServer.id,
        password
      );

      if (!verificacion.success) {
        setDeleteError("Clave administrativa incorrecta");
        return;
      }

            await deleteServer(token, deletingServer.id);

      setDeletingServer(null);

      showToast(`Servidor "${deletingServer.name}" eliminado`);

      cargarServidores();

    } catch (error) {

      console.error(error);
      setDeleteError("No se pudo conectar con el servidor");

    } finally {

      setDeleting(false);

    }

  }

  return (
    <>
      <div className="section__head">
        <div>
          <p className="section__eyebrow">Infraestructura</p>
          <h2 className="section__title">Mis servidores</h2>
        </div>

        <Button variant="primary" onClick={() => setShowAddModal(true)}>
          Agregar servidor
        </Button>
      </div>

      {!loading && servers.length === 0 && (
  <div className="empty-state">
    <strong>Aún no tienes servidores</strong>
    Agrega tu primer VPS para empezar a monitorearlo.
  </div>
)}

{loading && (
  <div className="server-list">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="server-card server-card--skeleton">
        <Skeleton style={{ width: "12px", height: "12px", borderRadius: "50%" }} />
        <Skeleton style={{ width: "180px", height: "16px" }} />
        <Skeleton style={{ width: "70px", height: "14px", marginLeft: "auto" }} />
      </div>
    ))}
  </div>
)}

{!loading && (
  <div className="server-list">
    {servers.map((server) => (
      <ServerCard
        key={server.id}
        server={server}
        onEdit={() => setEditingServer(server)}
        onDelete={() => setDeletingServer(server)}
      />
    ))}
  </div>
)}

      {showAddModal && (
        <AddServerModal
          onClose={() => setShowAddModal(false)}
          onCreated={cargarServidores}
        />
      )}

      {editingServer && (
        <EditServerModal
          server={editingServer}
          onClose={() => setEditingServer(null)}
          onUpdated={cargarServidores}
        />
      )}

      {deletingServer && (
        <ConfirmDialog
          title="Eliminar servidor"
          message={`¿Seguro que quieres eliminar "${deletingServer.name}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          loading={deleting}
          requirePassword
          passwordError={deleteError}
          onCancel={() => setDeletingServer(null)}
          onConfirm={confirmarEliminar}
        />
      )}
    </>
  );
}

export default Servers;