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
    createServerAdminSession,
    logoutAdminSession
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

module.exports = router;