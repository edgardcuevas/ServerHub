import API_URL from "../config/api";
import { handleResponse } from "./apiClient";

export async function createRegistrationKey(token, serverId) {

  const respuesta = await fetch(
    `${API_URL}/api/registration-keys`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ serverId })
    }
  );

  return await handleResponse(respuesta);
}

export async function getKeys(token) {

  const respuesta = await fetch(
    `${API_URL}/api/registration-keys`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return await handleResponse(respuesta);
}