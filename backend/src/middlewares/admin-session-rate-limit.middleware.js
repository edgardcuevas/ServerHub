/**
 * Rate limiting del desbloqueo administrativo.
 *
 * POST /:id/admin-session es la puerta de entrada al
 * sistema de sesiones administrativas. Exige un JWT
 * valido y la contrasena administrativa del servidor, y a
 * partir de ahi habilita operaciones privilegiadas sobre
 * procesos, servicios, archivos y reinicio. Sin limite,
 * un usuario autenticado podria automatizar la
 * verificacion de contrasenas administrativas contra sus
 * servidores o contra los de otros usuarios.
 *
 * POR QUE VA DESPUES DE authenticate
 *
 * El identificador de la clave incluye req.user.id, asi
 * que el limitador necesita un usuario ya autenticado. Si
 * se ejecutara antes, las peticiones sin JWT valido
 * consumirian la cuota de un usuario legitimo, y bastaria
 * con inundar el endpoint sin credenciales para bloquear a
 * ese usuario. Por eso el orden es
 * authenticate, luego limitador, luego controlador.
 *
 * POR QUE LA CLAVE ES COMPUESTA
 *
 * Con solo la IP, cualquier atacante podria distribuir
 * intentos cambiando de servidor. Con solo userId, un
 * usuario bloquearia el desbloqueo de todos sus servidores.
 * Con solo serverId, un atacante podria agotar la cuota de
 * un servidor que no es suyo. La combinacion de usuario,
 * servidor e IP hace que un intento solo cobre contra una
 * combinacion concreta.
 *
 * LO QUE NO ENTRA EN LA CLAVE
 *
 * Ni la contrasena administrativa, ni el JWT, ni el token
 * de sesion, ni el correo, ni el nombre del servidor. La
 * clave nunca se imprime ni se registra.
 *
 * LO QUE NO SE HACE
 *
 * No se leen X-Forwarded-For, X-Real-IP ni
 * CF-Connecting-IP a mano: la IP la resuelve
 * express-rate-limit desde req.ip, que es la unica fuente
 * que Express considera fiable segun su configuracion de
 * trust proxy. No se usa un Map propio, no se habilita
 * trust proxy y no se depende de req.agent.
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
    "Demasiados intentos de desbloqueo administrativo. Intenta nuevamente más tarde.";

/**
 * Segmentos estables para cuando faltan user o server. Con
 * el orden correcto de middlewares no deberian ocurrir:
 * authenticate rechaza antes. Evita un TypeError y sobre
 * todo evita un espacio de claves sin limite, que si una
 * peticion llegara con un user distinto en cada llamada
 * consumiria memoria por cada una.
 */
const MISSING_USER =
    "sin-usuario";

const MISSING_SERVER =
    "sin-servidor";

function readUserSegment(user) {

    if (
        !user ||
        user.id === undefined ||
        user.id === null
    ) {

        return MISSING_USER;

    }

    return String(user.id);

}

function readServerSegment(
    params
) {

    const serverId =
        params && params.id;

    if (
        serverId === undefined ||
        serverId === null ||
        serverId === ""
    ) {

        return MISSING_SERVER;

    }

    return String(serverId);

}

function createAdminSessionRateLimit(
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
         * Clave compuesta usuario, servidor e IP. La IP se
         * normaliza con ipKeyGenerator, que agrupa IPv6 por
         * prefijo /56 y colapsa IPv4 mapeada, de modo que un
         * atacante con un prefijo IPv6 grande no pueda
         * multiplicar su cuota cambiando de direccion.
         */
        keyGenerator: req =>
            [
                readUserSegment(
                    req.user
                ),
                readServerSegment(
                    req.params
                ),
                ipKeyGenerator(
                    req.ip
                )
            ].join(":"),

        standardHeaders: "draft-8",
        legacyHeaders: false,
        statusCode: 429,

        /**
         * Cuenta exitos y fallos por igual. Un desbloqueo
         * correcto emite una credencial de sesion, asi que
         * dejarlo fuera abriria la via de automatizacion que
         * este limitador existe para cerrar.
         */
        skipSuccessfulRequests: false,
        skipFailedRequests: false,

        /**
         * Contrato uniforme. No revela si hubo contrasenas
         * correctas, ni cuantos intentos quedan, ni si el
         * servidor existe.
         */
        message: {
            success: false,
            message: TOO_MANY_REQUESTS
        }
    });

}

module.exports = {
    createAdminSessionRateLimit,
    DEFAULT_WINDOW_MS,
    DEFAULT_LIMIT,
    TOO_MANY_REQUESTS
};
