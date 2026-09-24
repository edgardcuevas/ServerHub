import API_URL from "../config/api";
import { handleResponse } from "./apiClient";

export async function getTechnologyDiscovery(token, adminToken, serverId) {

  const respuesta = await fetch(
    `${API_URL}/api/server/${serverId}/technologies/discovery`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-admin-session": adminToken
      }
    }
  );

  return await handleResponse(respuesta);
}