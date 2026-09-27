const express =
    require("express");

const router =
    express.Router();

const {
    authenticate
} = require(
    "../middlewares/auth.middleware"
);

const {
    requireAdminSession
} = require(
    "../middlewares/admin-session.middleware"
);

const {
    createServerAdminSession,
    logoutAdminSession,
    refreshServerAdminSession
} = require(
    "../controllers/admin-session.controller"
);

const {
    createAdminSessionRateLimit
} = require(
    "../middlewares/" +
    "admin-session-rate-limit.middleware"
);

const adminSessionRateLimit =
    createAdminSessionRateLimit();

/**
 * El limitador va despues de authenticate porque su clave
 * incluye req.user.id. Si fuera antes, las peticiones sin
 * JWT consumirian la cuota de un usuario autenticado.
 */
router.post(
    "/:id/admin-session",
    authenticate,
    adminSessionRateLimit,
    createServerAdminSession
);

router.post(
    "/:id/admin-session/logout",
    authenticate,
    logoutAdminSession
);

/**
 * La renovacion exige que la sesion siga siendo valida en el
 * momento de la peticion, asi que requireAdminSession va
 * delante. La escritura vuelve a comprobar las mismas
 * condiciones en su UPDATE, de modo que la proteccion no
 * depende solo del middleware.
 *
 * No lleva el limitador de desbloqueo: ese protege la
 * verificacion de la contrasena administrativa, y aqui no se
 * vuelve a verificar. Tampoco se vuelve a pedir la
 * contrasena.
 */
router.post(
    "/:id/admin-session/refresh",
    authenticate,
    requireAdminSession,
    refreshServerAdminSession
);

module.exports = router;