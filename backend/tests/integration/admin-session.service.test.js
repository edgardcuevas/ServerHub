/**
 * CARACTERIZACION de las sesiones administrativas.
 *
 * Esta fase no anade comportamiento. Documenta lo que el
 * codigo hace hoy, para que las fases siguientes puedan
 * cambiarlo con una base de pruebas que ya no se rompe.
 *
 * QUE SE DOCUMENTA
 *
 * 1. La creacion emite un token de 64 hexadecimales, una
 *    expiracion de 15 minutos y persiste la fila.
 * 2. No hay limite de sesiones simultaneas: un mismo
 *    usuario y servidor pueden tener varias activas.
 * 3. La validacion exige user_id, server_id y token
 *    coincidentes y una expiracion futura.
 * 4. La expiracion se filtra en SQL, no en JavaScript.
 * 5. El borrado exige userId, serverId y token coincidentes,
 *    devuelve true si borro una fila y false si no borro
 *    ninguna, y no afecta a otras sesiones del mismo
 *    usuario.
 * 6. Las sesiones caen por cascada al borrar el servidor o
 *    el usuario.
 *
 * LO QUE NO SE TOCA
 *
 * No se introduce refresh, ni duracion absoluta, ni
 * revocacion, ni rate limiting, ni columnas nuevas. El
 * esquema se usa tal cual: no existen revoked_at,
 * updated_at ni absolute_expires_at.
 *
 * RELOJ
 *
 * expires_at y created_at son "timestamp without time zone".
 * node-postgres serializa un Date de JavaScript como hora
 * local con desplazamiento y PostgreSQL descarta el
 * desplazamiento, asi que ambos valores comparten base de
 * reloj. Toda la aritmetica se resuelve en SQL, y se
 * comprueba antes que la zona de Node y la de la sesion
 * PostgreSQL coincidan, que es la precondicion para que la
 * medicion signifique algo.
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

const crypto =
    require("crypto");

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
    createAdminSession,
    validateAdminSession,
    deleteAdminSession
} = require(
    "../../src/services/admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

/**
 * crypto.randomBytes(32).toString("hex")
 */
const TOKEN_PATTERN =
    /^[a-f0-9]{64}$/;

const EXPECTED_TOKEN_LENGTH =
    64;

const SESSION_TTL_SECONDS =
    15 * 60;

const MIN_TTL_SECONDS =
    14 * 60 + 30;

const MAX_TTL_SECONDS =
    15 * 60 + 30;

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

    await assertClockConsistency();

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
 * Espejo de la comprobacion que ya usan las pruebas de
 * registration_key. Se duplica aqui a proposito, para no
 * ampliar el alcance del helper mas alla de la limpieza.
 */
async function assertClockConsistency() {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                NOW() AS now_with_zone,
                NOW() AT TIME ZONE 'UTC' AS utc_wall
            `
        );

    const databaseOffsetSeconds =
        (
            result.rows[0].now_with_zone.getTime() -
            result.rows[0].utc_wall.getTime()
        ) / 1000;

    const nodeOffsetSeconds =
        -new Date().getTimezoneOffset() * 60;

    assert.ok(
        Math.abs(
            databaseOffsetSeconds -
            nodeOffsetSeconds
        ) <= 60,
        "la zona horaria de Node y la de la sesión " +
        "PostgreSQL deben coincidir para medir la " +
        `expiración: Node=${nodeOffsetSeconds}s, ` +
        `PostgreSQL=${databaseOffsetSeconds}s`
    );

}

async function getSessionRowById(
    sessionId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                id,
                user_id,
                server_id,
                expires_at,
                created_at
            FROM admin_sessions
            WHERE id = $1
            `,
            [sessionId]
        );

    return result.rows[0];

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

/**
 * Estado de expiracion resuelto en SQL. expires_at viene de
 * un Date de JavaScript y created_at de CURRENT_TIMESTAMP,
 * por lo que la diferencia entre ambos mide el TTL sin
 * depender de la zona horaria.
 */
async function getSessionExpiry(
    sessionId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                expires_at > NOW() AS is_future,
                EXTRACT(
                    EPOCH FROM (
                        expires_at - created_at
                    )
                ) AS ttl_seconds,
                expires_at > (
                    NOW() AT TIME ZONE 'UTC'
                ) AS past_utc
            FROM admin_sessions
            WHERE id = $1
            `,
            [sessionId]
        );

    return result.rows[0];

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

/**
 * Fixture de una sesion ya expirada. Se inserta
 * directamente porque createAdminSession no permite elegir
 * la expiracion.
 */
async function createExpiredSession(
    userId,
    serverId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            INSERT INTO admin_sessions
            (
                user_id,
                server_id,
                token,
                expires_at
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id, token
            `,
            [
                userId,
                serverId,
                crypto
                    .randomBytes(32)
                    .toString("hex"),
                new Date(
                    Date.now() -
                    60 * 60 * 1000
                )
            ]
        );

    trackSession(result.rows[0].id);

    return result.rows[0];

}

test(
    "CASO 1: la creación válida emite un token de 64 hex y dura 15 minutos",
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

        assert.equal(
            typeof session.id,
            "number"
        );

        assert.equal(
            typeof session.token,
            "string"
        );

        assert.ok(
            session.token.length > 0
        );

        assert.match(
            session.token,
            TOKEN_PATTERN
        );

        assert.equal(
            session.token.length,
            EXPECTED_TOKEN_LENGTH
        );

        assert.equal(
            session.user_id,
            user.id
        );

        assert.equal(
            session.server_id,
            server.id
        );

        assert.ok(
            session.created_at,
            "created_at debe existir"
        );

        assert.ok(
            session.expires_at
        );

        const persisted =
            await getSessionRowById(
                session.id
            );

        assert.ok(
            persisted,
            "la fila debe estar persistida"
        );

        assert.equal(
            persisted.user_id,
            user.id
        );

        assert.equal(
            persisted.server_id,
            server.id
        );

        const expiry =
            await getSessionExpiry(
                session.id
            );

        assert.equal(
            expiry.is_future,
            true
        );

        const ttl =
            Number(expiry.ttl_seconds);

        assert.ok(
            ttl > MIN_TTL_SECONDS &&
                ttl < MAX_TTL_SECONDS,
            `el TTL debe acercarse a ` +
            `${SESSION_TTL_SECONDS}s y fue de ${ttl}s`
        );

    }
);

test(
    "CASO 2: se permiten varias sesiones simultáneas para el mismo usuario y servidor",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const primera =
            await createSessionFor(
                user.id,
                server.id
            );

        const segunda =
            await createSessionFor(
                user.id,
                server.id
            );

        assert.notEqual(
            primera.id,
            segunda.id
        );

        assert.notEqual(
            primera.token,
            segunda.token
        );

        assert.ok(
            await getSessionRowById(
                primera.id
            )
        );

        assert.ok(
            await getSessionRowById(
                segunda.id
            )
        );

        /**
         * UNIQUE(token) sigue satisfecho: son tokens
         * distintos, no una violacion.
         */
        assert.equal(
            await getSessionCountByToken(
                primera.token
            ),
            1
        );

        assert.equal(
            await getSessionCountByToken(
                segunda.token
            ),
            1
        );

        const validada =
            await validateAdminSession(
                user.id,
                server.id,
                segunda.token
            );

        assert.ok(validada);
        assert.equal(
            validada.id,
            segunda.id
        );

    }
);

test(
    "CASO 3: la validación correcta devuelve la sesión",
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

        const validada =
            await validateAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.ok(validada);
        assert.equal(
            validada.id,
            session.id
        );

        assert.equal(
            validada.user_id,
            user.id
        );

        assert.equal(
            validada.server_id,
            server.id
        );

        assert.equal(
            validada.token,
            session.token
        );

    }
);

test(
    "CASO 4: con otro usuario la validación devuelve null",
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

        const otroUsuario =
            await createTestUser();

        trackUser(otroUsuario.id);

        const validada =
            await validateAdminSession(
                otroUsuario.id,
                server.id,
                session.token
            );

        assert.equal(
            validada,
            null
        );

    }
);

test(
    "CASO 5: con otro servidor del mismo usuario la validación devuelve null",
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

        const validada =
            await validateAdminSession(
                user.id,
                otroServidor.id,
                session.token
            );

        assert.equal(
            validada,
            null
        );

        /**
         * Y la combinacion cruzada tambien.
         */
        const cruzada =
            await validateAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.ok(cruzada);

    }
);

test(
    "CASO 6: con un token inexistente la validación devuelve null",
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

        const tokenFalso =
            crypto
                .randomBytes(32)
                .toString("hex");

        const validada =
            await validateAdminSession(
                user.id,
                server.id,
                tokenFalso
            );

        assert.equal(
            validada,
            null
        );

    }
);

test(
    "CASO 7: una sesión expirada se rechaza",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const expirada =
            await createExpiredSession(
                user.id,
                server.id
            );

        const fila =
            await getSessionRowById(
                expirada.id
            );

        assert.ok(
            fila,
            "la fila sigue existiendo: expirar no " +
            "es borrar"
        );

        const expiry =
            await getSessionExpiry(
                expirada.id
            );

        assert.equal(
            expiry.is_future,
            false,
            "la expiracion debe estar en el pasado"
        );

        const validada =
            await validateAdminSession(
                user.id,
                server.id,
                expirada.token
            );

        assert.equal(
            validada,
            null,
            "una sesión expirada no debe validar"
        );

    }
);

test(
    "CASO 8A: el propietario correcto cierra su sesión",
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

        const deleted =
            await deleteAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(
            deleted,
            true
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            0,
            "la fila debe desaparecer"
        );

        const validada =
            await validateAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(
            validada,
            null
        );

    }
);

test(
    "CASO 8B: con otro usuario no se elimina la sesión",
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

        const otroUsuario =
            await createTestUser();

        trackUser(otroUsuario.id);

        const deleted =
            await deleteAdminSession(
                otroUsuario.id,
                server.id,
                session.token
            );

        assert.equal(
            deleted,
            false
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            1,
            "la sesión debe permanecer"
        );

        /**
         * Sigue validando para su propietario real.
         */
        const validada =
            await validateAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.ok(validada);
        assert.equal(
            validada.id,
            session.id
        );

    }
);

test(
    "CASO 8C: con otro servidor no se elimina la sesión",
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

        const deleted =
            await deleteAdminSession(
                user.id,
                otroServidor.id,
                session.token
            );

        assert.equal(
            deleted,
            false
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
        assert.equal(
            validada.id,
            session.id
        );

    }
);

test(
    "CASO 8D: con un token inexistente no se elimina nada",
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

        const tokenFalso =
            crypto
                .randomBytes(32)
                .toString("hex");

        const deleted =
            await deleteAdminSession(
                user.id,
                server.id,
                tokenFalso
            );

        assert.equal(
            deleted,
            false
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            1,
            "la sesión original debe permanecer"
        );

    }
);

test(
    "CASO 8E: un segundo cierre no lanza excepción y devuelve false",
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

        const primero =
            await deleteAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(
            primero,
            true
        );

        const segundo =
            await deleteAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(
            segundo,
            false
        );

    }
);

test(
    "CASO 8F: cerrar una sesión no afecta a las demás del mismo usuario",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const primera =
            await createSessionFor(
                user.id,
                server.id
            );

        const segunda =
            await createSessionFor(
                user.id,
                server.id
            );

        const deleted =
            await deleteAdminSession(
                user.id,
                server.id,
                primera.token
            );

        assert.equal(
            deleted,
            true
        );

        assert.equal(
            await getSessionCountByToken(
                primera.token
            ),
            0
        );

        assert.equal(
            await getSessionCountByToken(
                segunda.token
            ),
            1,
            "la otra sesión debe permanecer"
        );

    }
);

test(
    "CASO 9: la sesión desaparece por cascada al borrar el servidor",
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
         * Se borra la fila del servidor directamente. El
         * objeto bajo prueba es la cascada de la clave
         * foranea, no server.service.deleteServer, que
         * ademas escribiria una fila de auditoria ajena a
         * esta caracterizacion.
         */
        const pool =
            getTestPool();

        await pool.query(
            "DELETE FROM servers WHERE id = $1",
            [server.id]
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            0,
            "la sesión debe caer por cascada"
        );

        assert.equal(
            await getSessionRowById(
                session.id
            ),
            undefined
        );

    }
);

test(
    "CASO 10: la sesión desaparece por cascada al borrar el usuario",
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

        const pool =
            getTestPool();

        await pool.query(
            "DELETE FROM users WHERE id = $1",
            [user.id]
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            0,
            "la sesión debe caer por cascada"
        );

        assert.equal(
            await getSessionRowById(
                session.id
            ),
            undefined
        );

    }
);
