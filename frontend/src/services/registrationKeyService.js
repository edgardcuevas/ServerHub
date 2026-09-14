import API_URL from "../config/api";

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

  return await respuesta.json();
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

  return await respuesta.json();
}