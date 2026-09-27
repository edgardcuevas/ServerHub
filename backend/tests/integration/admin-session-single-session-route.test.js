/**
 * Politica de una sola sesion administrativa activa por
 * usuario y servidor, verificada por HTTP.
 *
 * Monta routers aislados con el controlador y el servicio
 * reales contra serverhub_test. No importa src/app.js, y la
 * autenticacion se sustituye por un middleware de prueba que
 * solo inyecta req.user. Para el desbloqueo se usa el
 * servicio real, que exige la contrasena administrativa del
 * servidor, con un hash bcrypt real en el fixture del
 * servidor. PostgreSQL no se simula en ningun punto.
 *
 * Lo que se comprueba es que el token antiguo deja de dar
 * acceso a una operacion protegida, que el nuevo si lo da, y
 * que refresh y logout se comportan en consecuencia.
 */

const {
    test,
    before,
    beforeEach,
    afterEach,
    after
} = require("node:test");

const assert =
    require("node:assert/strict");

const express =
    require("express");

const bcrypt =
    require("bcrypt");

const request =
    require("supertest");

/**
 * database.helper.js debe ser el primer require: inyecta la
 * configuracion de la base de pruebas antes de que se
 * construya el Pool de ../../src/config/db, que es un
 * singleton de modulo.
 */
const {
    verifyTestConnection,
    getTestPool,
    createTestUser,
    createTestServer,
    cleanupTestData,
    closeTestPool
} = require("../helpers/database.helper");

const {
    requireAdminSession
} = require(
    "../../src/middlewares/" +
    "admin-session.middleware"
);

const {
    createServerAdminSession,
    refreshServerAdminSession,
    logoutAdminSession
} = require(
    "../../src/controllers/" +
    "admin-session.controller"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const ADMIN_PASSWORD =
    "contrasena-de-prueba";

const trackedUserIds = [];

const trackedServerIds = [];

const trackedSessionIds = [];

function trackUser(userId) {

    trackedUserIds.push(
        Number(userId)
    );

}

function trackServer(serverId) {

    trackedServerIds.push(
        Number(serverId)
    );

}

function trackSession(sessionId) {

    trackedSessionIds.push(
        Number(sessionId)
    );

}

before(async () => {

    const info =
        await verifyTestConnection();

    assert.equal(
        info.database,
        TEST_DATABASE_NAME
    );

});

beforeEach(() => {

    trackedUserIds.length = 0;
    trackedServerIds.length = 0;
    trackedSessionIds.length = 0;

});

afterEach(async () => {

    await cleanupTestData({
        userIds:
            [
                ...trackedUserIds
            ],
        serverIds:
            [
                ...trackedServerIds
            ],
        sessionIds:
            [
                ...trackedSessionIds
            ]
    });

});

after(async () => {

    await closeTestPool();

});

function fakeAuthentication(
    req,
    res,
    next
) {

    const id =
        req.headers["x-test-user-id"];

    if (
        typeof id !== "string" ||
        !/^\d+$/.test(id)
    ) {

        return res.status(401).json({
            success: false,
            message:
                "Token requerido"
        });

    }

    req.user =
        { id: Number(id) };

    next();

}

function buildApp() {

    const app =
        express();

    app.use(
        express.json()
    );

    app.post(
        "/api/server/:id/admin-session",
        fakeAuthentication,
        createServerAdminSession
    );

    app.post(
        "/api/server/:id/admin-session/logout",
        fakeAuthentication,
        logoutAdminSession
    );

    app.post(
        "/api/server/:id/admin-session/refresh",
        fakeAuthentication,
        requireAdminSession,
        refreshServerAdminSession
    );

    /**
     * Operacion protegida minima, equivalente a las 24 que
     * usan requireAdminSession en server.routes.js. Sirve
     * para comprobar si un token da acceso o no.
     */
    app.post(
        "/api/server/:id/operacion-protegida",
        fakeAuthentication,
        requireAdminSession,
        (_req, res) => {
            res.json({
                success: true
            });
        }
    );

    return app;

}

async function createScenario() {

    const user =
        await createTestUser();

    trackUser(user.id);

    const server =
        await createTestServer({
            userId: user.id
        });

    trackServer(server.id);

    /**
     * El servicio real exige admin_password_hash, asi que
     * el fixture lleva un hash bcrypt autentico.
     */
    const pool =
        getTestPool();

    const hash =
        await bcrypt.hash(
            ADMIN_PASSWORD,
            4
        );

    await pool.query(
        `
        UPDATE servers
        SET admin_password_hash = $1
        WHERE id = $2
        `,
        [hash, server.id]
    );

    return {
        user,
        server
    };

}

function postUnlock(
    app,
    {
        userId,
        serverId
    }
) {

    return request(app)
        .post(
            `/api/server/${serverId}` +
            "/admin-session"
        )
        .set(
            "x-test-user-id",
            String(userId)
        )
        .send({
            password: ADMIN_PASSWORD
        });

}

function postProtected(
    app,
    {
        userId,
        serverId,
        token
    }
) {

    return request(app)
        .post(
            `/api/server/${serverId}` +
            "/operacion-protegida"
        )
        .set(
            "x-test-user-id",
            String(userId)
        )
        .set(
            "x-admin-session",
            token
        )
        .send({});

}

function postRefresh(
    app,
    {
        userId,
        serverId,
        token
    }
) {

    return request(app)
        .post(
            `/api/server/${serverId}` +
            "/admin-session/refresh"
        )
        .set(
            "x-test-user-id",
            String(userId)
        )
        .set(
            "x-admin-session",
            token
        )
        .send({});

}

function postLogout(
    app,
    {
        userId,
        serverId,
        token
    }
) {

    return request(app)
        .post(
            `/api/server/${serverId}` +
            "/admin-session/logout"
        )
        .set(
            "x-test-user-id",
            String(userId)
        )
        .send({ token });

}

async function countSessionsOf(
    userId,
    serverId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM admin_sessions
            WHERE user_id = $1
            AND server_id = $2
            `,
            [userId, serverId]
        );

    return result.rows[0].total;

}

test(
    "1 y 2. el segundo desbloqueo devuelve un token nuevo",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const app =
            buildApp();

        const primera =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        assert.equal(
            primera.status,
            200
        );

        assert.equal(
            primera.body.success,
            true
        );

        assert.ok(
            primera.body.token
        );

        const segunda =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        assert.equal(
            segunda.status,
            200
        );

        assert.ok(
            segunda.body.token
        );

        assert.notEqual(
            segunda.body.token,
            primera.body.token,
            "el token debe ser distinto"
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            1
        );

    }
);

test(
    "3 y 4. el token antiguo no accede y el nuevo sí",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const app =
            buildApp();

        const primera =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        const tokenA =
            primera.body.token;

        const segunda =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        const tokenB =
            segunda.body.token;

        const conAntiguo =
            await postProtected(app, {
                userId: user.id,
                serverId: server.id,
                token: tokenA
            });

        assert.equal(
            conAntiguo.status,
            401,
            "el token anterior no debe dar acceso"
        );

        const conNuevo =
            await postProtected(app, {
                userId: user.id,
                serverId: server.id,
                token: tokenB
            });

        assert.equal(
            conNuevo.status,
            200
        );

        assert.equal(
            conNuevo.body.success,
            true
        );

    }
);

test(
    "5 y 6. el refresh con el token antiguo da 401 y con el nuevo funciona",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const app =
            buildApp();

        const primera =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        const segunda =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        const refreshAntiguo =
            await postRefresh(app, {
                userId: user.id,
                serverId: server.id,
                token:
                    primera.body.token
            });

        assert.equal(
            refreshAntiguo.status,
            401
        );

        const refreshNuevo =
            await postRefresh(app, {
                userId: user.id,
                serverId: server.id,
                token:
                    segunda.body.token
            });

        assert.equal(
            refreshNuevo.status,
            200
        );

        assert.equal(
            refreshNuevo.body.success,
            true
        );

        assert.ok(
            refreshNuevo.body.expiresAt
        );

    }
);

test(
    "7 y 8. el logout con el token antiguo da 404 y con el nuevo funciona",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const app =
            buildApp();

        const primera =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        const segunda =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        const logoutAntiguo =
            await postLogout(app, {
                userId: user.id,
                serverId: server.id,
                token:
                    primera.body.token
            });

        assert.equal(
            logoutAntiguo.status,
            404
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            1,
            "la sesion vigente permanece"
        );

        const logoutNuevo =
            await postLogout(app, {
                userId: user.id,
                serverId: server.id,
                token:
                    segunda.body.token
            });

        assert.equal(
            logoutNuevo.status,
            200
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            0
        );

    }
);

test(
    "9. otro servidor conserva su propia sesión",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const otroServidor =
            await createTestServer({
                userId: user.id
            });

        trackServer(otroServidor.id);

        /**
         * El segundo servidor necesita tambien su hash de
         * contrasena administrativa, porque el desbloqueo
         * usa el servicio real.
         */
        const pool =
            getTestPool();

        const hash =
            await bcrypt.hash(
                ADMIN_PASSWORD,
                4
            );

        await pool.query(
            `
            UPDATE servers
            SET admin_password_hash = $1
            WHERE id = $2
            `,
            [hash, otroServidor.id]
        );

        const app =
            buildApp();

        const unlockA =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        const unlockB =
            await postUnlock(app, {
                userId: user.id,
                serverId: otroServidor.id
            });

        assert.equal(
            unlockB.status,
            200
        );

        /**
         * Reabrir el servidor A no invalida la sesion del
         * servidor B.
         */
        const nuevoA =
            await postUnlock(app, {
                userId: user.id,
                serverId: server.id
            });

        assert.equal(
            nuevoA.status,
            200
        );

        const enA =
            await postProtected(app, {
                userId: user.id,
                serverId: server.id,
                token: nuevoA.body.token
            });

        assert.equal(
            enA.status,
            200
        );

        const enB =
            await postProtected(app, {
                userId: user.id,
                serverId: otroServidor.id,
                token: unlockB.body.token
            });

        assert.equal(
            enB.status,
            200,
            "el otro servidor conserva su sesion"
        );

        const enAAntiguo =
            await postProtected(app, {
                userId: user.id,
                serverId: server.id,
                token: unlockA.body.token
            });

        assert.equal(
            enAAntiguo.status,
            401
        );

    }
);

test(
    "10. ninguna respuesta expone otros tokens",
    async () => {

        const escenario =
            await createScenario();

        const app =
            buildApp();

        const userId =
            escenario.user.id;

        const serverId =
            escenario.server.id;

        const primera =
            await postUnlock(app, {
                userId,
                serverId
            });

        const tokenA =
            primera.body.token;

        const segunda =
            await postUnlock(app, {
                userId,
                serverId
            });

        const tokenB =
            segunda.body.token;

        const refresh =
            await postRefresh(app, {
                userId,
                serverId,
                token: tokenB
            });

        const logoutAntiguo =
            await postLogout(app, {
                userId,
                serverId,
                token: tokenA
            });

        const logoutNuevo =
            await postLogout(app, {
                userId,
                serverId,
                token: tokenB
            });

        /**
         * El segundo desbloqueo no debe devolver el token
         * anterior. Su cuerpo solo lleva el suyo.
         */
        assert.equal(
            segunda.body.token,
            tokenB
        );

        const cuerpoSegunda =
            JSON.stringify(
                segunda.body
            );

        assert.ok(
            !cuerpoSegunda.includes(tokenA),
            "el segundo desbloqueo no debe " +
            "exponer el token anterior"
        );

        const respuestas = [
            refresh,
            logoutAntiguo,
            logoutNuevo
        ];

        for (
            const respuesta of respuestas
        ) {

            const cuerpo =
                JSON.stringify(
                    respuesta.body
                );

            assert.ok(
                !cuerpo.includes(tokenA),
                "ninguna respuesta debe " +
                "contener el token anterior"
            );

            assert.ok(
                !cuerpo.includes(tokenB),
                "ninguna respuesta debe " +
                "contener el token vigente"
            );

        }

    }
);

test(
    "el desbloqueo con contraseña incorrecta no crea sesión",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const app =
            buildApp();

        const fallido =
            await request(app)
                .post(
                    `/api/server/${server.id}` +
                    "/admin-session"
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    password: "incorrecta"
                });

        assert.equal(
            fallido.status,
            401
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            0
        );

    }
);
