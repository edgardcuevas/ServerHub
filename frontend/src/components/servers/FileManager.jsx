import { useEffect, useRef, useState } from "react";
import {
  browseFiles,
  clearStoredPath,
  createFolder,
  deleteFile,
  downloadCommandResult,
  getStoredPath,
  moveFile,
  renameFile,
  requestDownload,
  setStoredPath,
  uploadFile,
  waitForCommand
} from "../../services/fileService";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import PromptDialog from "../ui/PromptDialog";
import NewFileDialog from "../ui/NewFileDialog";
import EditFileDialog from "../ui/EditFileDialog";
import { useToast } from "../ui/Toast";

const LIMITE_EDICION_BYTES = 2 * 1024 * 1024;

function separadorDe(ruta) {
  return ruta && ruta.includes("\\") ? "\\" : "/";
}

function unirRuta(base, nombre) {
  if (!base) return nombre;

  const separador = separadorDe(base);

  return base.endsWith(separador)
    ? `${base}${nombre}`
    : `${base}${separador}${nombre}`;
}

function carpetaPadre(rutaCompleta) {
  const separador = separadorDe(rutaCompleta);
  const partes = rutaCompleta.split(separador).filter(Boolean);

  partes.pop();

  return separador === "\\"
    ? `${partes.join(separador)}\\`
    : `/${partes.join(separador)}`;
}

function formatearTamaño(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function textoABase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  bytes.forEach((b) => { binario += String.fromCharCode(b); });
  return btoa(binario);
}

function base64ATexto(base64) {
  const binario = atob(base64);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function FileManager({ serverId, adminToken }) {

  const [pathStack, setPathStack] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [moving, setMoving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [editingFile, setEditingFile] = useState(null);

  const showToast = useToast();
  const currentPath = pathStack[pathStack.length - 1];
  const token = localStorage.getItem("token");
  const requestIdRef = useRef(0);

  async function cargar(path, opciones = {}) {

  const { esRestauracion = false } = opciones;

  const idPeticion = ++requestIdRef.current;

  setLoading(true);
  setError("");

  try {

    const datos = await browseFiles(token, adminToken, serverId, path);

    if (!datos.success) {
      throw new Error(datos.message || "No se pudo listar la carpeta");
    }

    const command = datos.command;
    const resultado = await waitForCommand(token, adminToken, serverId, command.id);

    if (idPeticion !== requestIdRef.current) return;

    setItems(resultado.items || []);

    if (!path) {
      setPathStack([resultado.path]);
    }

  } catch (err) {

    if (idPeticion !== requestIdRef.current) return;

    console.error(err);

    if (esRestauracion) {
      clearStoredPath(serverId);
      setPathStack([]);
      cargar(undefined);
      return;
    }

    setError(err.message || "No se pudo listar la carpeta");

  } finally {

    if (idPeticion === requestIdRef.current) {
      setLoading(false);
    }

  }

}

  useEffect(() => {

    const guardada = getStoredPath(serverId);

    if (guardada && guardada.length > 0) {
      setPathStack(guardada);
      cargar(guardada[guardada.length - 1], { esRestauracion: true });
    } else {
      cargar(undefined);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {

    if (pathStack.length > 0) {
      setStoredPath(serverId, pathStack);
    }

  }, [pathStack, serverId]);

  function entrarACarpeta(item) {
    setSearchTerm("");
    setPathStack((pila) => [...pila, item.path]);
    cargar(item.path);
  }

  function subirNivel() {
    if (pathStack.length <= 1) return;

    setSearchTerm("");
    const nuevaPila = pathStack.slice(0, -1);
    setPathStack(nuevaPila);
    cargar(nuevaPila[nuevaPila.length - 1]);
  }

  async function crearCarpeta(nombre) {

    if (!nombre.trim()) return;

    setWorking(true);

    try {

      const nuevaRuta = unirRuta(currentPath, nombre.trim());
      const datos = await createFolder(token, adminToken, serverId, nuevaRuta);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Carpeta creada");
      setShowNewFolder(false);
      cargar(currentPath);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo crear la carpeta", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function crearArchivo(nombre, contenido) {

    if (!nombre.trim()) return;

    setWorking(true);

    try {

      const nuevaRuta = unirRuta(currentPath, nombre.trim());
      const contenidoBase64 = textoABase64(contenido || "");
      const datos = await uploadFile(token, adminToken, serverId, nuevaRuta, contenidoBase64);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Archivo creado");
      setShowNewFile(false);
      cargar(currentPath);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo crear el archivo", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function confirmarRenombrar(nuevoNombre) {

    if (!nuevoNombre.trim() || !renaming) return;

    setWorking(true);

    try {

      const nuevaRuta = unirRuta(carpetaPadre(renaming.path), nuevoNombre.trim());
      const datos = await renameFile(token, adminToken, serverId, renaming.path, nuevaRuta);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Renombrado correctamente");
      setRenaming(null);
      cargar(currentPath);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo renombrar", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function confirmarMover(destino) {

    if (!destino.trim() || !moving) return;

    setWorking(true);

    try {

      const datos = await moveFile(token, adminToken, serverId, moving.path, destino.trim());

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Movido correctamente");
      setMoving(null);
      cargar(currentPath);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo mover", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function confirmarEliminar() {

    if (!deleting) return;

    setWorking(true);

    try {

      const datos = await deleteFile(token, adminToken, serverId, deleting.path);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Eliminado correctamente");
      setDeleting(null);
      cargar(currentPath);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo eliminar", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function descargar(item) {

    setWorking(true);

    try {

      const datos = await requestDownload(token, adminToken, serverId, item.path);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      const { blob, fileName } = await downloadCommandResult(token, datos.command.id);

      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = fileName;
      enlace.click();
      URL.revokeObjectURL(url);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo descargar el archivo", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function abrirEditor(item) {

    if (item.size > LIMITE_EDICION_BYTES) {
      showToast("El archivo es muy grande para editar acá, descargalo en su lugar", "danger");
      return;
    }

    setWorking(true);

    try {

      const datos = await requestDownload(token, adminToken, serverId, item.path);

      if (!datos.success) throw new Error(datos.message);

      const resultado = await waitForCommand(token, adminToken, serverId, datos.command.id);

      setEditingFile({
        path: item.path,
        name: item.name,
        content: base64ATexto(resultado.content)
      });

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo abrir el archivo", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function guardarEdicion(nuevoContenido) {

    if (!editingFile) return;

    setWorking(true);

    try {

      const contenidoBase64 = textoABase64(nuevoContenido);
      const datos = await uploadFile(token, adminToken, serverId, editingFile.path, contenidoBase64);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Archivo guardado");
      setEditingFile(null);
      cargar(currentPath);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo guardar el archivo", "danger");

    } finally {

      setWorking(false);

    }

  }

  async function subirArchivo(evento) {

    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setWorking(true);

    try {

      const contenidoBase64 = await new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result.split(",")[1]);
        lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
        lector.readAsDataURL(archivo);
      });

      const rutaDestino = unirRuta(currentPath, archivo.name);
      const datos = await uploadFile(token, adminToken, serverId, rutaDestino, contenidoBase64);

      if (!datos.success) throw new Error(datos.message);

      await waitForCommand(token, adminToken, serverId, datos.command.id);

      showToast("Archivo subido");
      cargar(currentPath);

    } catch (err) {

      console.error(err);
      showToast(err.message || "No se pudo subir el archivo", "danger");

    } finally {

      setWorking(false);
      evento.target.value = "";

    }

  }

  const itemsFiltrados = items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="section section--admin">
      <div className="section__head">
        <div>
          <p className="section__eyebrow">Panel administrativo</p>
          <h2 className="section__title">Archivos</h2>
        </div>
      </div>

      <div className="file-manager__toolbar">
        <span className="file-manager__path">{currentPath || "/"}</span>

        <div className="file-manager__actions">
          <Button variant="ghost" className="sh-btn--sm" onClick={subirNivel} disabled={pathStack.length <= 1}>
            Subir nivel
          </Button>
          <Button variant="ghost" className="sh-btn--sm" onClick={() => setShowNewFolder(true)} disabled={working}>
            Nueva carpeta
          </Button>
          <Button variant="ghost" className="sh-btn--sm" onClick={() => setShowNewFile(true)} disabled={working}>
            Nuevo archivo
          </Button>
          <label className={`sh-btn sh-btn--ghost sh-btn--sm${working ? " sh-btn--disabled" : ""}`}>
            Subir archivo
            <input type="file" hidden onChange={subirArchivo} disabled={working} />
          </label>
        </div>
      </div>

      <div className="file-manager__search">
        <input
          type="text"
          className="sh-field__input"
          placeholder="Buscar en esta carpeta..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {error && <div className="sh-alert" role="alert">{error}</div>}

      {loading ? (
        <p className="modal__sub" style={{ marginBottom: 0 }}>Cargando...</p>
      ) : itemsFiltrados.length === 0 ? (
        <div className="empty-state">
          <strong>{searchTerm ? "Sin resultados" : "Carpeta vacía"}</strong>
          {searchTerm
            ? "No encontramos archivos que coincidan con la búsqueda."
            : "No hay archivos ni carpetas acá."}
        </div>
      ) : (
        <div className="file-list file-list--scroll">
          {itemsFiltrados.map((item) => (
            <div className="file-row" key={item.path}>
              <div
                className={`file-row__info${item.type === "directory" ? " file-row__info--dir" : ""}`}
                onClick={() => item.type === "directory" && entrarACarpeta(item)}
              >
                <span className="file-row__name">
                  {item.type === "directory" ? "📁" : "📄"} {item.name}
                </span>
                {item.type === "file" && (
                  <span className="file-row__meta">{formatearTamaño(item.size)}</span>
                )}
              </div>

              <div className="file-row__actions">
                {item.type === "file" && (
                  <>
                    <Button variant="ghost" className="sh-btn--sm" onClick={() => descargar(item)} disabled={working}>
                      Descargar
                    </Button>
                    <Button variant="ghost" className="sh-btn--sm" onClick={() => abrirEditor(item)} disabled={working}>
                      Editar
                    </Button>
                  </>
                )}
                <Button variant="ghost" className="sh-btn--sm" onClick={() => setRenaming(item)} disabled={working}>
                  Renombrar
                </Button>
                <Button variant="ghost" className="sh-btn--sm" onClick={() => setMoving(item)} disabled={working}>
                  Mover
                </Button>
                <Button variant="ghost" className="sh-btn--sm" onClick={() => setDeleting(item)} disabled={working}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewFolder && (
        <PromptDialog
          title="Nueva carpeta"
          label="Nombre de la carpeta"
          confirmLabel="Crear"
          loadingLabel="Creando..."
          loading={working}
          onCancel={() => setShowNewFolder(false)}
          onConfirm={crearCarpeta}
        />
      )}

      {showNewFile && (
        <NewFileDialog
          loading={working}
          onCancel={() => setShowNewFile(false)}
          onConfirm={crearArchivo}
        />
      )}

      {editingFile && (
        <EditFileDialog
          fileName={editingFile.name}
          initialContent={editingFile.content}
          loading={working}
          onCancel={() => setEditingFile(null)}
          onConfirm={guardarEdicion}
        />
      )}

      {renaming && (
        <PromptDialog
          title="Renombrar"
          label="Nuevo nombre"
          initialValue={renaming.name}
          confirmLabel="Renombrar"
          loadingLabel="Renombrando..."
          loading={working}
          onCancel={() => setRenaming(null)}
          onConfirm={confirmarRenombrar}
        />
      )}

      {moving && (
        <PromptDialog
          title="Mover"
          message={`Ingresá la ruta de destino completa para "${moving.name}".`}
          label="Ruta de destino"
          confirmLabel="Mover"
          loadingLabel="Moviendo..."
          loading={working}
          onCancel={() => setMoving(null)}
          onConfirm={confirmarMover}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Eliminar"
          message={`¿Seguro que querés eliminar "${deleting.name}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          loading={working}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmarEliminar}
        />
      )}
    </section>
  );
}

export default FileManager;