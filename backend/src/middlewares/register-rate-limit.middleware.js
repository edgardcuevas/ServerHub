/**
 * Rate limiting por IP para el registro de agentes.
 *
 * POST /api/agent/register es la unica ruta de escritura
 * sensible que no exige credenciales: el agente todavia no
 * esta registrado y por eso no puede autenticarse. Sin un
 * limite, cualquier IP puede abrir transacciones y generar
 * filas de auditoria sin descanso.
 *
 * DECISIONES
 *
 * - No se depende de req.agent. En esta ruta el agente aun
 *   no existe, y createAgentRateLimit() lee req.agent.id,
 *   lo que lanzaria un TypeError y devolveria 500 en lugar
 *   de 429.
 * - No se usa un Map propio. El limitador existente es
 *   precisamente un Map propio, y no cuenta N intentos por
 *   ventana sino que impose un cooldown de uno, ademas de
 *   no limpiar nunca sus entradas.
 * - No se leen X-Forwarded-For, X-Real-IP ni
 *   CF-Connecting-IP a mano. La IP la resuelve
 *   express-rate-limit desde req.ip, que es la unica fuente
 *   que Express considera fiable segun su configuracion de
 *   trust proxy. Leer esas cabeceras manualmente permitiria
 *   a un cliente falsear su identidad y evadir el limite.
 * - No se habilita trust proxy. Eso depende de la topologia
 *   real de despliegue y se documenta aparte.
 * - IPv6 se agrupa por prefijo con ipKeyGenerator, que es la
 *   forma segura de evitar que un atacante disponga de miles
 *   de direcciones IPv6 para multiplicar su cuota.
 *
 * ALCANCE
 *
 * Solo POST /api/agent/register. Las demas rutas de agente
 * conservan createAgentRateLimit() sin modificar.
 */

const {
    rateLimit,
    ipKeyGenerator
} = require("express-rate-limit");

const DEFAULT_WINDOW_MS =
    15 * 60 * 1000;

const DEFAULT_LIMIT =
    10;

const TOO_MANY_REQUESTS =
    "Demasiados intentos de registro. Intenta nuevamente más tarde.";

/**
 * Cada llamada construye un limitador nuevo, con su propio
 * almacén. Las pruebas crean una instancia por caso para no
 * compartir contadores, igual que se hace con los datos de
 * la base de pruebas.
 */
function createRegisterRateLimit(
    options = {}
) {

    const windowMs =
        options.windowMs
        ?? DEFAULT_WINDOW_MS;

    const limit =
        options.limit
        ?? DEFAULT_LIMIT;

    return rateLimit({
        windowMs,
        limit,

        /**
         * Identificacion segura por IP. Resuelve IPv6 por
         * prefijo y normaliza IPv4 mapeada a IPv4.
         */
        keyGenerator: req =>
            ipKeyGenerator(
                req.ip
            ),

        standardHeaders: "draft-8",
        legacyHeaders: false,
        statusCode: 429,

        /**
         * Un intento cuenta tanto si el registro tuvo exito
         * como si fallo. La clave de registro es de un solo
         * uso, asi que un 201 consume cuota igual que un
         * 400, y excluir los exitos dejaria abierta una via
         * de abuso.
         */
        skipSuccessfulRequests: false,
        skipFailedRequests: false,

        /**
         * Contrato uniforme de la API. No revela cuantos
         * intentos quedan, ni si hubo claves validas.
         */
        message: {
            success: false,
            message: TOO_MANY_REQUESTS
        }
    });

}

module.exports = {
    createRegisterRateLimit,
    DEFAULT_WINDOW_MS,
    DEFAULT_LIMIT,
    TOO_MANY_REQUESTS
};
