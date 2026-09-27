/**
 * Renovacion de sesion administrativa por HTTP.
 *
 * Usa el controlador real, el servicio real y el middleware
 * real requireAdminSession contra serverhub_test. No importa
 * src/app.js, y la autenticacion se sustituye por un
 * middleware de prueba que solo inyecta req.user, porque lo
 * que importa aqui es la cadena de la sesion, no el JWT.
 *
 * El orden de la ruta es el de produccion:
 * authenticate, requireAdminSession, refreshServerAdminSession.
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
    requireAdminSession
} = require(
    "../../src/middlewares/" +
    "admin-session.middleware"
);

const {
    refreshServerAdminSession
} = require(
    "../../src/controllers/" +
    "admin-session.controller"
);

const {
    createAdminSession,
    deleteAdminSession
} = require(
    "../../src/services/" +
    "admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const MISSING_SESSION_MESSAGE =
    "Sesión administrativa requerida";

const NOT_RENEWABLE_MESSAGE =
    "Sesión administrativa inválida, expirada o no renovable";

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
                trackedServerIds
            ].flat(),
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
 * Middleware de prueba en lugar de authenticate. Reproduce
 * el efecto sin cargar el secreto JWT.
 */
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

/**
 * app normal, con la cadena de produccion completa.
 */
function buildApp() {

    const app =
        express();

    app.use(
        express.json()
    );

    app.post(
        "/api/server/:id/admin-session/refresh",
        fakeAuthentication,
        requireAdminSession,
        refreshServerAdminSession
    );

    return app;

}

/**
 * app sin requireAdminSession, para alcanzar la rama del
 * controlador que devuelve null. En produccion esa rama es
 * defensa en profundidad, porque el middleware ya habria
 * rechazado antes.
 */
function buildAppWithoutMiddleware() {

    const app =
        express();

    app.use(
        express.json()
    );

    app.post(
        "/api/server/:id/admin-session/refresh",
        fakeAuthentication,
        refreshServerAdminSession
    );

    return app;

}

function postRefresh(
    app,
    {
        userId,
        serverId,
        token
    }
) {

    let peticion =
        request(app)
            .post(
                `/api/server/${serverId}` +
                "/admin-session/refresh"
            )
            .set(
                "x-test-user-id",
                String(userId)
            );

    if (
        token !== undefined
    ) {
        peticion = peticion.set(
            "x-admin-session",
            token
        );
    }

    return peticion.send({});

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

async function getSessionSnapshot(
    sessionId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                token,
                expires_at::text AS expires_at,
                created_at::text AS created_at
            FROM admin_sessions
            WHERE id = $1
            `,
            [sessionId]
        );

    return result.rows[0];

}

async function countSessionsFor(
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

/**
 * Fixture con created_at y expires_at controlados, para los
 * casos de limite absoluto.
 */
async function createSessionFixture(
    options
) {

    const pool =
        getTestPool();

    const crypto =
        require("crypto");

    const result =
        await pool.query(
            `
            INSERT INTO admin_sessions
            (
                user_id,
                server_id,
                token,
                expires_at,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, token
            `,
            [
                options.userId,
                options.serverId,
                crypto
                    .randomBytes(32)
                    .toString("hex"),
                options.expiresAt,
                options.createdAt
            ]
        );

    trackSession(result.rows[0].id);

    return result.rows[0];

}

test(
    "1. sin x-admin-session responde 401 con el mensaje esperado",
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

        const antes =
            await getSessionSnapshot(
                session.id
            );

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        assert.equal(
            respuesta.body.success,
            false
        );

        assert.equal(
            respuesta.body.message,
            MISSING_SESSION_MESSAGE
        );

        const despues =
            await getSessionSnapshot(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at,
            "no debe renovarse nada"
        );

    }
);

test(
    "2. con un token inválido responde 401 y no renueva",
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

        const antes =
            await getSessionSnapshot(
                session.id
            );

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: "f".repeat(64)
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        const despues =
            await getSessionSnapshot(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

    }
);

test(
    "3. con un token expirado responde 401 y no revive la sesión",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const expirada =
            await createSessionFixture({
                userId: user.id,
                serverId: server.id,
                expiresAt:
                    new Date(
                        Date.now() -
                        60 * 60 * 1000
                    ),
                createdAt:
                    new Date(
                        Date.now() -
                        3 * 60 * 60 * 1000
                    )
            });

        const antes =
            await getSessionSnapshot(
                expirada.id
            );

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: expirada.token
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        const despues =
            await getSessionSnapshot(
                expirada.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

    }
);

test(
    "4. con otro usuario responde 401 y la sesión queda intacta",
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

        const antes =
            await getSessionSnapshot(
                session.id
            );

        const intruso =
            await createTestUser();

        trackUser(intruso.id);

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: intruso.id,
                    serverId: server.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        const despues =
            await getSessionSnapshot(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

    }
);

test(
    "5. con otro servidor responde 401 y la sesión queda intacta",
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

        const antes =
            await getSessionSnapshot(
                session.id
            );

        const otroServidor =
            await createTestServer({
                userId: user.id
            });

        trackServer(otroServidor.id);

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: otroServidor.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        const despues =
            await getSessionSnapshot(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

    }
);

test(
    "6. con una sesión válida responde 200 con expiresAt y absoluteExpiresAt",
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

        const antes =
            await getSessionSnapshot(
                session.id
            );

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.success,
            true
        );

        assert.ok(
            respuesta.body.expiresAt
        );

        assert.ok(
            respuesta.body.absoluteExpiresAt
        );

        const despues =
            await getSessionSnapshot(
                session.id
            );

        assert.ok(
            despues.expires_at >
                antes.expires_at,
            "expires_at debe aumentar"
        );

    }
);

test(
    "7. la respuesta no contiene token ni identificadores internos",
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

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.token,
            undefined
        );

        assert.equal(
            respuesta.body.userId,
            undefined
        );

        assert.equal(
            respuesta.body.serverId,
            undefined
        );

        assert.equal(
            respuesta.body.createdAt,
            undefined
        );

        const cuerpo =
            JSON.stringify(
                respuesta.body
            );

        assert.ok(
            !cuerpo.includes(session.token),
            "el cuerpo no debe contener el token"
        );

        assert.deepEqual(
            Object.keys(respuesta.body).sort(),
            [
                "absoluteExpiresAt",
                "expiresAt",
                "success"
            ]
        );

    }
);

test(
    "8. el token almacenado no cambia y sigue siendo una sola fila",
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

        const antes =
            await getSessionSnapshot(
                session.id
            );

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        const despues =
            await getSessionSnapshot(
                session.id
            );

        assert.equal(
            despues.token,
            antes.token
        );

        assert.equal(
            await countSessionsFor(
                user.id,
                server.id
            ),
            1
        );

    }
);

test(
    "9. una sesión eliminada no puede renovarse",
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

        await deleteAdminSession(
            user.id,
            server.id,
            session.token
        );

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        assert.equal(
            await countSessionsFor(
                user.id,
                server.id
            ),
            0,
            "no debe recrear la fila"
        );

    }
);

test(
    "10. una sesión con el límite absoluto vencido no puede renovarse",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const vencida =
            await createSessionFixture({
                userId: user.id,
                serverId: server.id,
                expiresAt:
                    new Date(
                        Date.now() +
                        5 * 60 * 1000
                    ),
                createdAt:
                    new Date(
                        Date.now() -
                        (3 * 60 * 60 * 1000)
                    )
            });

        const antes =
            await getSessionSnapshot(
                vencida.id
            );

        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: vencida.token
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        const despues =
            await getSessionSnapshot(
                vencida.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at,
            "no debe extenderla"
        );

    }
);

test(
    "11. la ruta no exige nuevamente la contraseña administrativa",
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

        /**
         * No se envia password en el cuerpo ni ninguna otra
         * credencial mas alla del token de sesion.
         */
        const respuesta =
            await postRefresh(
                buildApp(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

    }
);

test(
    "12. el controlador devuelve 401 cuando el servicio no renueva",
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

        await deleteAdminSession(
            user.id,
            server.id,
            session.token
        );

        /**
         * Sin requireAdminSession delante, para alcanzar la
         * rama que se ocupa cuando refreshAdminSession
         * devuelve null. En produccion el middleware ya
         * habria respondido, con lo que esta rama es defensa
         * en profundidad.
         */
        const respuesta =
            await postRefresh(
                buildAppWithoutMiddleware(),
                {
                    userId: user.id,
                    serverId: server.id,
                    token: session.token
                }
            );

        assert.equal(
            respuesta.status,
            401
        );

        assert.equal(
            respuesta.body.message,
            NOT_RENEWABLE_MESSAGE
        );

    }
);

test(
    "13. el token en el cuerpo no se acepta como credencial",
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

        const antes =
            await getSessionSnapshot(
                session.id
            );

        /**
         * El token va en el cuerpo, no en la cabecera, y la
         * peticion no lleva x-admin-session. No debe
         * renovar.
         */
        const respuesta =
            await request(
                buildApp()
            )
                .post(
                    `/api/server/${server.id}` +
                    "/admin-session/refresh"
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .send({
                    token: session.token
                });

        assert.equal(
            respuesta.status,
            401
        );

        const despues =
            await getSessionSnapshot(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

    }
);

test(
    "14. una petición ya autorizada no se cancela si caduca durante el refresco",
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

        const app =
            buildApp();

        /**
         * requireAdminSession valida una sola vez, al
         * inicio de la peticion. Lo que documenta este caso
         * es que una peticion que ya paso el middleware no
         * vuelve a validarse: por eso una subida larga o una
         * peticion posterior que llegue despues de la
         * expiracion si necesita una sesion renovada.
         */
        const enVuelo =
            request(app)
                .post(
                    `/api/server/${server.id}` +
                    "/admin-session/refresh"
                )
                .set(
                    "x-test-user-id",
                    String(user.id)
                )
                .set(
                    "x-admin-session",
                    session.token
                )
                .send({});

        /**
         * Se fuerza la expiracion de la sesion mientras la
         * peticion esta en curso. El UPDATE exige
         * expires_at > CURRENT_TIMESTAMP, asi que la
         * renovacion debe fallar en lugar de revivir una
         * sesion caducada. Lo relevante es que no hay una
         * segunda validacion automatica dentro de la misma
         * peticion: o bien el middleware la acepto al
         * inicio, o bien la escritura la rechaza.
         */
        const pool =
            getTestPool();

        await pool.query(
            `
            UPDATE admin_sessions
            SET expires_at =
                CURRENT_TIMESTAMP - INTERVAL '1 minute'
            WHERE id = $1
            `,
            [session.id]
        );

        const respuesta =
            await enVuelo;

        assert.equal(
            respuesta.status,
            401
        );

        const despues =
            await pool.query(
                `
                SELECT
                    (expires_at > CURRENT_TIMESTAMP)
                        AS still_valid
                FROM admin_sessions
                WHERE id = $1
                `,
                [session.id]
            );

        assert.equal(
            despues.rows[0].still_valid,
            false,
            "una sesion caducada no se revive"
        );

    }
);
