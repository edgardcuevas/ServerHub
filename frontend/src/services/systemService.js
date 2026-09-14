import API_URL from "../config/api";

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

  return await respuesta.json();
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

  return await respuesta.json();
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

  return await respuesta.json();
}