import API_URL from "../config/api";
import { handleResponse } from "./apiClient";


export async function getActiveAlerts(token) {

  const respuesta = await fetch(`${API_URL}/api/alerts/active`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  return await handleResponse(respuesta);
}

export async function getAlerts(token) {

  const respuesta = await fetch(`${API_URL}/api/alerts`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  return await handleResponse(respuesta);
}