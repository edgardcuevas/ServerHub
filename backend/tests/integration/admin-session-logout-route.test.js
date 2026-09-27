/**
 * Cierre de sesion administrativa por HTTP.
 *
 * Usa el controlador real contra serverhub_test, con un
 * router aislado y un middleware de prueba que inyecta
 * req.user. No se importa src/app.js: habria que cargar
 * doce routers y la autenticacion JWT completa sin aportar
 * nada, porque lo que se comprueba es como el controlador
 * usa req.user.id, req.params.id y req.body.token.
 *
 * El middleware de prueba reproduce los tipos reales de
 * produccion: req.user.id es un numero, porque auth.middleware
 * asigna el payload decodificado del JWT, y req.params.id es
 * una cadena, porque Express lo entrega asi. Esa combinacion
 * numero y cadena es la que llega ahora a la consulta
 * DELETE, y por eso se prueba tal cual.
 *
 * PostgreSQL no se simula en ningun punto: la eliminacion
 * ocurre de verdad y se comprueba releendo la fila.
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
    logoutAdminSession
} = require(
    "../../src/controllers/" +
    "admin-session.controller"
);

const {
    createAdminSession,
    validateAdminSession
} = require(
    "../../src/services/" +
    "admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const MISSING_TOKEN_MESSAGE =
    "Token de sesión administrativa requerido";

const NOT_FOUND_MESSAGE =
    "Sesión administrativa no encontrada";

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

/**
 * Middleware de prueba en lugar de un JWT completo. Solo
 * reproduce lo que el controlador lee.
 */
function fakeAuthentication(
    req,
    _res,
    next
) {

    const id =
        req.headers["x-test-user-id"];

    req.user =
        typeof id === "string" &&
        /^\d+$/.test(id)
            ? { id: Number(id) }
            : null;

    next();

}

function buildApp() {

    const app =
        express();

    app.use(
        express.json()
    );

    /**
     * Mismo camino que en produccion, con app.use
     * ("/api/server", adminSessionRoutes). Aqui se replica
     * el prefijo para que las rutas exercised sean las
     * reales y no una copia que podria divergir.
     */
    app.post(
        "/api/server/:id/admin-session/logout",
        fakeAuthentication,
        logoutAdminSession
    );

    return app;

}

async function getSessionCountByToken(
    token
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM admin_sessions
            WHERE token = $1
            `,
            [token]
        );

    return result.rows[0].total;

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

    return {
        user,
        server
    };

}

async function createSessionFor(
    userId,
    serverId
) {

    const session =
        await createAdminSession(
            userId,
            serverId
        );

    trackSession(session.id);

    return session;

}

test(
    "1. sin token responde 400",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const response =
            await request(buildApp())
                .post(
                    `/api/server/${server.id}` +
                    "/admin-session/logout"
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({});

        assert.equal(
            response.status,
            400
        );

        assert.equal(
            response.body.success,
            false
        );

        assert.equal(
            response.body.message,
            MISSING_TOKEN_MESSAGE
        );

    }
);

test(
    "2. con token de tipo incorrecto responde 400 con el mismo mensaje",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        for (
            const token of
            [123, true, null, ["a"]]
        ) {

            const response =
                await request(buildApp())
                    .post(
                        `/api/server/` +
                        `${server.id}/admin-session/logout`
                    )
                    .set(
                        "x-test-user-id",
                        String(user.id)
                    )
                    .send({ token });

            assert.equal(
                response.status,
                400,
                `token ${JSON.stringify(token)} ` +
                "debe dar 400"
            );

            assert.equal(
                response.body.message,
                MISSING_TOKEN_MESSAGE
            );

        }

        const vacio =
            await request(buildApp())
                .post(
                    `/api/server/` +
                    `${server.id}/admin-session/logout`
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({ token: "" });

        assert.equal(
            vacio.status,
            400
        );

        assert.equal(
            vacio.body.message,
            MISSING_TOKEN_MESSAGE
        );

    }
);

test(
    "3. el propietario correcto cierra su sesión con 200",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const session =
            await createSessionFor(
                user.id,
                server.id
            );

        const response =
            await request(buildApp())
                .post(
                    `/api/server/` +
                    `${server.id}/admin-session/logout`
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    token: session.token
                });

        assert.equal(
            response.status,
            200
        );

        assert.equal(
            response.body.success,
            true
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            0,
            "la sesión debe estar eliminada"
        );

    }
);

test(
    "4. con otro usuario responde 404 y la sesión permanece",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const session =
            await createSessionFor(
                user.id,
                server.id
            );

        const intruso =
            await createTestUser();

        trackUser(intruso.id);

        const response =
            await request(buildApp())
                .post(
                    `/api/server/` +
                    `${server.id}/admin-session/logout`
                )
                .set(
                    "x-test-user-id",
                    String(intruso.id)
                )
                .send({
                    token: session.token
                });

        assert.equal(
            response.status,
            404
        );

        assert.equal(
            response.body.success,
            false
        );

        assert.equal(
            response.body.message,
            NOT_FOUND_MESSAGE
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            1,
            "la sesión debe permanecer"
        );

        const validada =
            await validateAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.ok(validada);

    }
);

test(
    "5. con otro servidor responde 404 y la sesión permanece",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const session =
            await createSessionFor(
                user.id,
                server.id
            );

        const otroServidor =
            await createTestServer({
                userId: user.id
            });

        trackServer(otroServidor.id);

        const response =
            await request(buildApp())
                .post(
                    `/api/server/` +
                    `${otroServidor.id}/admin-session/logout`
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    token: session.token
                });

        assert.equal(
            response.status,
            404
        );

        assert.equal(
            response.body.message,
            NOT_FOUND_MESSAGE
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            1,
            "la sesión debe permanecer"
        );

    }
);

test(
    "6. con un token inexistente responde 404",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        await createSessionFor(
            user.id,
            server.id
        );

        const response =
            await request(buildApp())
                .post(
                    `/api/server/` +
                    `${server.id}/admin-session/logout`
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    token:
                        "f".repeat(64)
                });

        assert.equal(
            response.status,
            404
        );

        assert.equal(
            response.body.message,
            NOT_FOUND_MESSAGE
        );

    }
);

test(
    "7. el segundo cierre responde 404",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const session =
            await createSessionFor(
                user.id,
                server.id
            );

        const app = buildApp();

        const ruta =
            `/api/server/` +
            `${server.id}/admin-session/logout`;

        const primero =
            await request(app)
                .post(ruta)
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    token: session.token
                });

        assert.equal(
            primero.status,
            200
        );

        const segundo =
            await request(app)
                .post(ruta)
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    token: session.token
                });

        assert.equal(
            segundo.status,
            404
        );

        assert.equal(
            segundo.body.message,
            NOT_FOUND_MESSAGE
        );

    }
);

test(
    "8. la respuesta nunca contiene el token",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const session =
            await createSessionFor(
                user.id,
                server.id
        );

        const app = buildApp();

        const ruta =
            `/api/server/` +
            `${server.id}/admin-session/logout`;

        const exito =
            await request(app)
                .post(ruta)
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    token: session.token
                });

        const intruso =
            await createTestUser();

        trackUser(intruso.id);

        const fallo =
            await request(app)
                .post(ruta)
                .set(
                    "x-test-user-id",
                    String(intruso.id)
                )
                .send({
                    token: session.token
                });

        for (
            const response of
            [exito, fallo]
        ) {

            const cuerpo =
                JSON.stringify(
                    response.body
                );

            assert.ok(
                !cuerpo.includes(
                    session.token
                ),
                "el cuerpo no debe contener el token"
            );

            assert.equal(
                response.body.token,
                undefined
            );

        }

    }
);
