import API_URL from "../config/api";
import { handleResponse } from "./apiClient";

export async function listProcesses(token, adminToken, serverId) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/processes`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      }
    }
  );

  return await handleResponse(respuesta);
}

export async function killProcess(token, adminToken, serverId, pid) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/processes/kill`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      },
      body: JSON.stringify({ pid })
    }
  );

  return await handleResponse(respuesta);
}

export async function getProcessDetails(token, adminToken, serverId, pid) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/processes/details`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      },
      body: JSON.stringify({ pid })
    }
  );

  return await handleResponse(respuesta);
}

export async function getProcessTree(token, adminToken, serverId) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/processes/tree`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      }
    }
  );

  return await handleResponse(respuesta);
}

export async function classifyProcess(token, adminToken, serverId, pid) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/processes/classify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      },
      body: JSON.stringify({ pid })
    }
  );

  return await handleResponse(respuesta);
}

export async function rebootServer(token, adminToken, serverId) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/system/reboot`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      }
    }
  );

  return await handleResponse(respuesta);
}