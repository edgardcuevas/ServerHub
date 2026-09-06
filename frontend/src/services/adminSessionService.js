import API_URL from "../config/api";

const STORAGE_PREFIX = "sh_admin_session_";

export async function createAdminSession(token, serverId, password) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/admin-session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ password })
    }
  );

  return await respuesta.json();
}

export async function logoutAdminSession(token, serverId, sessionToken) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/admin-session/logout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ token: sessionToken })
    }
  );

  return await respuesta.json();
}

export function getStoredAdminSession(serverId) {

  const raw = sessionStorage.getItem(STORAGE_PREFIX + serverId);

  if (!raw) return null;

  const sesion = JSON.parse(raw);

  if (new Date(sesion.expiresAt).getTime() <= Date.now()) {
    sessionStorage.removeItem(STORAGE_PREFIX + serverId);
    return null;
  }

  return sesion;
}

export function setStoredAdminSession(serverId, session) {
  sessionStorage.setItem(STORAGE_PREFIX + serverId, JSON.stringify(session));
}

export function clearStoredAdminSession(serverId) {
  sessionStorage.removeItem(STORAGE_PREFIX + serverId);
}