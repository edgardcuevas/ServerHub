import API_URL from "../config/api";
import { handleResponse } from "./apiClient";

export async function listServices(token, adminToken, serverId) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/services`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      }
    }
  );

  return await handleResponse(respuesta);
}

export async function getServiceDetails(token, adminToken, serverId, serviceName) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/services/details`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      },
      body: JSON.stringify({ serviceName })
    }
  );

  return await handleResponse(respuesta);
}

async function llamarServicio(token, adminToken, serverId, accion, serviceName) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/services/${accion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      },
      body: JSON.stringify({ serviceName })
    }
  );

  return await handleResponse(respuesta);
}

export function startService(token, adminToken, serverId, serviceName) {
  return llamarServicio(token, adminToken, serverId, "start", serviceName);
}

export function stopService(token, adminToken, serverId, serviceName) {
  return llamarServicio(token, adminToken, serverId, "stop", serviceName);
}

export function restartService(token, adminToken, serverId, serviceName) {
  return llamarServicio(token, adminToken, serverId, "restart", serviceName);
}