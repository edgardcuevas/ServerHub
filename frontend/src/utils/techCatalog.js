const CATALOGO = [
  {
    categoria: "database",
    etiqueta: "Base de datos",
    descripcion: "Motor de base de datos: almacena y gestiona los datos de una o más aplicaciones.",
    patrones: ["mysql", "mariadb", "postgres", "mongod", "sqlite", "mssql", "oracle"]
  },
  {
    categoria: "cache",
    etiqueta: "Caché / cola",
    descripcion: "Servicio en memoria usado como caché, cola de mensajes o almacenamiento rápido clave-valor.",
    patrones: ["redis", "memcached", "rabbitmq"]
  },
  {
    categoria: "web",
    etiqueta: "Servidor web",
    descripcion: "Servidor web o proxy: recibe peticiones HTTP/HTTPS y las distribuye a las aplicaciones.",
    patrones: ["nginx", "apache", "httpd", "caddy", "iis"]
  },
  {
    categoria: "runtime",
    etiqueta: "Entorno de ejecución",
    descripcion: "Entorno de ejecución de una aplicación (runtime de un lenguaje de programación).",
    patrones: ["node", "python", "java", "php", "ruby", "dotnet"]
  },
  {
    categoria: "container",
    etiqueta: "Contenedores",
    descripcion: "Motor de contenedores: empaqueta y ejecuta aplicaciones de forma aislada.",
    patrones: ["docker", "containerd", "podman"]
  },
  {
    categoria: "manager",
    etiqueta: "Gestor de procesos",
    descripcion: "Gestor de procesos: mantiene otra aplicación corriendo y la reinicia si falla.",
    patrones: ["pm2", "supervisor"]
  }
];

export function detectarTecnologia(nombre, tipoGenerico = "Proceso") {

  const normalizado = String(nombre || "").toLowerCase();

  for (const entrada of CATALOGO) {
    if (entrada.patrones.some((patron) => normalizado.includes(patron))) {
      return {
        categoria: entrada.categoria,
        etiqueta: entrada.etiqueta,
        descripcion: entrada.descripcion
      };
    }
  }

  return {
    categoria: "generic",
    etiqueta: tipoGenerico,
    descripcion:
      tipoGenerico === "Servicio"
        ? "Servicio del sistema sin una categoría específica reconocida."
        : "Programa en ejecución sin una categoría específica reconocida."
  };

}