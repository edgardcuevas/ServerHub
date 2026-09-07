import API_URL from "../config/api";

export async function getActiveAlerts(token) {

  const respuesta = await fetch(`${API_URL}/api/alerts/active`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  return await respuesta.json();
}

export async function getAlerts(token) {

  const respuesta = await fetch(`${API_URL}/api/alerts`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  return await respuesta.json();
}