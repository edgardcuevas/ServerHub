const {
    createAdminSession,
    deleteAdminSession
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

module.exports = {
    createServerAdminSession,
    logoutAdminSession
};