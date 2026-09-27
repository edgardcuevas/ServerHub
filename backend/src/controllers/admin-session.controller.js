const {
    createAdminSession,
    deleteAdminSession,
    refreshAdminSession
} = require(
    "../services/admin-session.service"
);

const serverService =
    require("../services/server.service");

async function createServerAdminSession(
    req,
    res
) {

    try {

        const valid =
            await serverService
                .verifyServerPassword(
                    req.user.id,
                    req.params.id,
                    req.body.password
                );

        if (!valid) {

            return res.status(401).json({
                success: false,
                message:
                    "Contraseña administrativa incorrecta"
            });

        }

        const session =
            await createAdminSession(
                req.user.id,
                req.params.id
            );

        res.json({
            success: true,
            token: session.token,
            expiresAt:
                session.expires_at
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function logoutAdminSession(
    req,
    res
) {

    try {

        const { token } =
            req.body || {};

        /**
         * Validacion localizada. No se anade un validador
         * Joi todavia.
         */
        if (
            typeof token !== "string" ||
            token === ""
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Token de sesión administrativa requerido"
            });

        }

        /**
         * El cierre va ligado a la propiedad: el usuario
         * autenticado y el servidor de la ruta tienen que
         * coincidir con los de la sesion. Antes solo se
         * usaba req.body.token, y req.user.id y
         * req.params.id se ignoraban.
         */
        const deleted =
            await deleteAdminSession(
                req.user.id,
                req.params.id,
                token
            );

        /**
         * El mismo mensaje para token inexistente, token
         * de otro usuario, token de otro servidor y sesion
         * ya cerrada, para no permitir enumeracion.
         */
        if (
            !deleted
        ) {

            return res.status(404).json({
                success: false,
                message:
                    "Sesión administrativa no encontrada"
            });

        }

        res.json({
            success: true
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

/**
 * Renueva una sesion administrativa vigente.
 *
 * El token se lee solo de la cabecera x-admin-session, igual
 * que hacen requireAdminSession y
 * transfer-admin-session.middleware. No se acepta desde el
 * cuerpo: la renovacion es una operacion sobre una sesion
 * ya establecida, y su credencial viaja en la cabecera que
 * el resto del flujo de administracion ya usa.
 *
 * No devuelve el token ni identificadores internos. El limite
 * absoluto lo calcula PostgreSQL y llega como
 * absolute_expires_at, de modo que el valor que ve el cliente
 * es exactamente el que aplico la politica.
 */
async function refreshServerAdminSession(
    req,
    res
) {

    try {

        const token =
            req.headers[
                "x-admin-session"
            ];

        if (
            typeof token !== "string" ||
            token === ""
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Sesión administrativa requerida"
            });

        }

        /**
         * Propiedad completa, igual que en el cierre: el
         * usuario autenticado y el servidor de la ruta.
         */
        const session =
            await refreshAdminSession(
                req.user.id,
                req.params.id,
                token
            );

        /**
         * El servicio devuelve null si la sesion no existe,
         * no es de este usuario o servidor, esta expirada o
         * su limite absoluto ya vencio. Con
         * requireAdminSession delante, esta rama es defensa
         * en profundidad.
         */
        if (
            !session
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Sesión administrativa inválida, expirada o no renovable"
            });

        }

        res.json({
            success: true,
            expiresAt:
                session.expires_at,
            absoluteExpiresAt:
                session.absolute_expires_at
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message:
                error.message
        });

    }

}

module.exports = {
    createServerAdminSession,
    logoutAdminSession,
    refreshServerAdminSession
};