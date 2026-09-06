import API_URL from "../config/api";

async function llamarFiles(token, adminToken, serverId, accion, body) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/files/${accion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      },
      body: JSON.stringify(body)
    }
  );

  return await respuesta.json();
}

export function browseFiles(token, adminToken, serverId, path) {
  return llamarFiles(token, adminToken, serverId, "browse", { path });
}

export function requestDownload(token, adminToken, serverId, path) {
  return llamarFiles(token, adminToken, serverId, "download", { path });
}

export function uploadFile(token, adminToken, serverId, path, content) {
  return llamarFiles(token, adminToken, serverId, "upload", { path, content });
}

export function createFolder(token, adminToken, serverId, path) {
  return llamarFiles(token, adminToken, serverId, "create-folder", { path });
}

export function renameFile(token, adminToken, serverId, oldPath, newPath) {
  return llamarFiles(token, adminToken, serverId, "rename", { oldPath, newPath });
}

export function deleteFile(token, adminToken, serverId, path) {
  return llamarFiles(token, adminToken, serverId, "delete", { path });
}

export function moveFile(token, adminToken, serverId, sourcePath, destinationPath) {
  return llamarFiles(token, adminToken, serverId, "move", { sourcePath, destinationPath });
}

export async function getCommandStatus(token, adminToken, serverId, commandId) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/commands/${commandId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      }
    }
  );

  return await respuesta.json();
}

export async function waitForCommand(
  token,
  adminToken,
  serverId,
  commandId,
  { intervalMs = 1500, timeoutMs = 30000 } = {}
) {

  const inicio = Date.now();

  while (Date.now() - inicio < timeoutMs) {

    const datos = await getCommandStatus(token, adminToken, serverId, commandId);

    if (!datos.success) {
      throw new Error(datos.message || "No se pudo consultar el comando");
    }

    if (datos.command.status === "COMPLETED") {
      return datos.command.result;
    }

    if (datos.command.status === "FAILED") {
      throw new Error(datos.command.result?.error || "El comando falló en el agente");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Tiempo de espera agotado");
}

export async function downloadCommandResult(token, commandId) {

  const respuesta = await fetch(
    `${API_URL}/api/agent/commands/download/${commandId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!respuesta.ok) {
    throw new Error("No se pudo descargar el archivo");
  }

  const disposition = respuesta.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="(.+)"/);
  const fileName = match ? match[1] : "archivo";

  const blob = await respuesta.blob();

  return { blob, fileName };
}