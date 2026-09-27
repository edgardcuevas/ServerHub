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
    refreshAdminSession,
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

/**
 * Fixture de una sesion con created_at y expires_at
 * controlados. Necesaria para los casos de limite absoluto,
 * que createAdminSession no permite construir.
 */
async function createSessionFixture(
    options
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

/**
 * Instantes de sesion en texto, tal como los devuelve
 * PostgreSQL. Comparar texto de "timestamp without time
 * zone" contra texto evita por completo el problema de la
 * zona horaria, porque ambos proceden de la misma base de
 * reloj del servidor.
 */
/**
 * Conteo acotado a una combinacion usuario y servidor, que es
 * la unidad de la politica de una sola sesion activa.
 */
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

async function getSessionInstants(
    sessionId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                expires_at::text AS expires_at,
                created_at::text AS created_at,
                token
            FROM admin_sessions
            WHERE id = $1
            `,
            [sessionId]
        );

    return result.rows[0];

}

/**
 * Comprobaciones del limite absoluto resueltas en SQL, que es
 * donde se aplica la politica.
 */
async function getAbsoluteLimitState(
    sessionId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                (expires_at = created_at + INTERVAL '2 hours')
                    AS limited_by_absolute,
                (expires_at >
                    CURRENT_TIMESTAMP + INTERVAL '14 minutes')
                    AS extended_15_minutes,
                (created_at + INTERVAL '2 hours'
                    > CURRENT_TIMESTAMP)
                    AS absolute_still_open,
                (expires_at > CURRENT_TIMESTAMP)
                    AS still_valid,
                created_at + INTERVAL '2 hours'
                    AS absolute_expires_at
            FROM admin_sessions
            WHERE id = $1
            `,
            [sessionId]
        );

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

/**
 * CASO 2A: el segundo desbloqueo del mismo usuario y servidor
 * sustituye al primero.
 *
 * Sustituye al antiguo CASO 2, que documentaba varias
 * sesiones simultaneas. Esa politica ya no es la vigente.
 */
test(
    "CASO 2A: el segundo desbloqueo reemplaza al primero",
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

        /**
         * Solo queda la fila de la segunda sesion.
         */
        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            1
        );

        assert.equal(
            await getSessionCountByToken(
                primera.token
            ),
            0,
            "la fila anterior debe eliminarse"
        );

        assert.equal(
            await getSessionCountByToken(
                segunda.token
            ),
            1
        );

        /**
         * El token anterior deja de validar y el nuevo
         * valida. La invalidacion es por ausencia de fila,
         * no por marca de revocacion.
         */
        const validadaAntes =
            await validateAdminSession(
                user.id,
                server.id,
                primera.token
            );

        assert.equal(
            validadaAntes,
            null
        );

        const validadaDespues =
            await validateAdminSession(
                user.id,
                server.id,
                segunda.token
            );

        assert.ok(validadaDespues);
        assert.equal(
            validadaDespues.id,
            segunda.id
        );

        /**
         * Y la fila superviviente es la segunda.
         */
        const fila =
            await getSessionRowById(
                segunda.id
            );

        assert.ok(fila);
        assert.equal(
            fila.user_id,
            user.id
        );
        assert.equal(
            fila.server_id,
            server.id
        );

    }
);

test(
    "CASO 2B: otro servidor del mismo usuario no queda afectado",
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

        const sesionA =
            await createSessionFor(
                user.id,
                server.id
            );

        const sesionB =
            await createSessionFor(
                user.id,
                otroServidor.id
            );

        /**
         * Reabrir el servidor A no debe tocar la sesion del
         * servidor B.
         */
        const nuevaA =
            await createSessionFor(
                user.id,
                server.id
            );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            1
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                otroServidor.id
            ),
            1
        );

        assert.equal(
            await getSessionCountByToken(
                sesionB.token
            ),
            1,
            "la sesion del otro servidor permanece"
        );

        assert.equal(
            await getSessionCountByToken(
                sesionA.token
            ),
            0
        );

        assert.equal(
            await getSessionCountByToken(
                nuevaA.token
            ),
            1
        );

        const validaA =
            await validateAdminSession(
                user.id,
                server.id,
                nuevaA.token
            );

        assert.ok(validaA);

        const validaB =
            await validateAdminSession(
                user.id,
                otroServidor.id,
                sesionB.token
            );

        assert.ok(
            validaB,
            "el otro servidor conserva su sesion"
        );

        assert.equal(
            validaB.id,
            sesionB.id
        );

    }
);

test(
    "CASO 2C: otro usuario no queda afectado",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const otroUsuario =
            await createTestUser();

        trackUser(otroUsuario.id);

        const suServidor =
            await createTestServer({
                userId: otroUsuario.id
            });

        trackServer(suServidor.id);

        const sesionPropia =
            await createSessionFor(
                user.id,
                server.id
            );

        const sesionAjena =
            await createSessionFor(
                otroUsuario.id,
                suServidor.id
            );

        /**
         * Reabrir la sesion del usuario A solo sustituye la
         * suya.
         */
        const nuevaPropia =
            await createSessionFor(
                user.id,
                server.id
            );

        assert.equal(
            await getSessionCountByToken(
                sesionAjena.token
            ),
            1,
            "la sesion de otro usuario permanece"
        );

        assert.equal(
            await getSessionCountByToken(
                sesionPropia.token
            ),
            0
        );

        assert.equal(
            await getSessionCountByToken(
                nuevaPropia.token
            ),
            1
        );

        const validaAjena =
            await validateAdminSession(
                otroUsuario.id,
                suServidor.id,
                sesionAjena.token
            );

        assert.ok(validaAjena);
        assert.equal(
            validaAjena.id,
            sesionAjena.id
        );

    }
);

test(
    "CASO 2D: tras cada reemplazo solo el token más reciente valida",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const tokens = [];

        for (
            let vuelta = 0;
            vuelta < 4;
            vuelta += 1
        ) {

            const sesion =
                await createSessionFor(
                    user.id,
                    server.id
                );

            tokens.push(
                sesion.token
            );

            assert.equal(
                await countSessionsOf(
                    user.id,
                    server.id
                ),
                1,
                "siempre una sola fila"
            );

            /**
             * Todos los tokens anteriores deben haber
             * dejado de validar, y el recien creado debe
             * validar.
             */
            for (
                let indice = 0;
                indice < tokens.length - 1;
                indice += 1
            ) {

                const validada =
                    await validateAdminSession(
                        user.id,
                        server.id,
                        tokens[indice]
                    );

                assert.equal(
                    validada,
                    null,
                    `el token de la vuelta ` +
                    `${indice} no debe validar`
                );

            }

            const actual =
                await validateAdminSession(
                    user.id,
                    server.id,
                    sesion.token
                );

            assert.ok(actual);

        }

        assert.equal(
            tokens.length,
            4
        );

        const total =
            await countSessionsOf(
                user.id,
                server.id
            );

        assert.equal(
            total,
            1
        );

    }
);

test(
    "CASO 2E: el refresh de la sesión nueva sigue funcionando",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const antigua =
            await createSessionFor(
                user.id,
                server.id
            );

        const nueva =
            await createSessionFor(
                user.id,
                server.id
            );

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                nueva.token
            );

        assert.ok(renovada);

        const despues =
            await getSessionInstants(
                nueva.id
            );

        assert.equal(
            despues.token,
            nueva.token,
            "el refresh no rota el token"
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            1
        );

        /**
         * La sesion antigua sigue invalida tras el refresh.
         */
        const validadaAntigua =
            await validateAdminSession(
                user.id,
                server.id,
                antigua.token
            );

        assert.equal(
            validadaAntigua,
            null
        );

    }
);

test(
    "CASO 2F: el logout afecta únicamente a la sesión actual",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        const antigua =
            await createSessionFor(
                user.id,
                server.id
            );

        const nueva =
            await createSessionFor(
                user.id,
                server.id
            );

        /**
         * El token antiguo ya no cierra nada, porque su fila
         * no existe.
         */
        const conAntiguo =
            await deleteAdminSession(
                user.id,
                server.id,
                antigua.token
            );

        assert.equal(
            conAntiguo,
            false
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            1,
            "la sesion nueva permanece"
        );

        const conNuevo =
            await deleteAdminSession(
                user.id,
                server.id,
                nueva.token
            );

        assert.equal(
            conNuevo,
            true
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

/**
 * CASO 8F: cerrar una sesión no afecta a las de OTRO
 * servidor del mismo usuario.
 *
 * Antes este caso usaba dos sesiones del mismo servidor, lo
 * que ya es imposible bajo la politica de una sola sesion
 * activa. La garantia equivalente ahora es que el cierre es
 * tan acotado como la propia politica: afecta a la fila que
 * coincide con usuario, servidor y token, y a nada mas.
 */
test(
    "CASO 8F: cerrar una sesión no afecta a otro servidor del mismo usuario",
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

        const enEste =
            await createSessionFor(
                user.id,
                server.id
            );

        const enOtro =
            await createSessionFor(
                user.id,
                otroServidor.id
            );

        const deleted =
            await deleteAdminSession(
                user.id,
                server.id,
                enEste.token
            );

        assert.equal(
            deleted,
            true
        );

        assert.equal(
            await getSessionCountByToken(
                enEste.token
            ),
            0
        );

        assert.equal(
            await getSessionCountByToken(
                enOtro.token
            ),
            1,
            "la sesión del otro servidor " +
            "debe permanecer"
        );

        const valida =
            await validateAdminSession(
                user.id,
                otroServidor.id,
                enOtro.token
            );

        assert.ok(valida);
        assert.equal(
            valida.id,
            enOtro.id
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

test(
    "CASO 11: la renovaci�n extiende la expiracion y respeta el limite absoluto",
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
            await getSessionInstants(
                session.id
            );

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.ok(renovada);
        assert.equal(
            renovada.id,
            session.id
        );
        assert.equal(
            renovada.user_id,
            user.id
        );
        assert.equal(
            renovada.server_id,
            server.id
        );

        const despues =
            await getSessionInstants(
                session.id
            );

        assert.ok(
            despues.expires_at >
                antes.expires_at,
            "expires_at debe aumentar"
        );

        assert.equal(
            despues.token,
            antes.token,
            "el token no debe cambiar"
        );

        const limite =
            await getAbsoluteLimitState(
                session.id
            );

        assert.equal(
            limite.absolute_still_open,
            true
        );

        assert.equal(
            limite.extended_15_minutes,
            true,
            "la renovacion debe extender 15 minutos"
        );

        assert.equal(
            limite.limited_by_absolute,
            false,
            "aun no se ha alcanzado el maximo " +
            "de 2 horas"
        );

        assert.ok(
            limite.absolute_expires_at
        );

        /**
         * Sigue siendo una sola fila.
         */
        const filas =
            await getSessionCountByToken(
                session.token
            );

        assert.equal(filas, 1);

    }
);

test(
    "CASO 12: renovar con otro usuario devuelve null y no cambia nada",
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
            await getSessionInstants(
                session.id
            );

        const otroUsuario =
            await createTestUser();

        trackUser(otroUsuario.id);

        const renovada =
            await refreshAdminSession(
                otroUsuario.id,
                server.id,
                session.token
            );

        assert.equal(
            renovada,
            null
        );

        const despues =
            await getSessionInstants(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

        assert.ok(
            await validateAdminSession(
                user.id,
                server.id,
                session.token
            )
        );

    }
);

test(
    "CASO 13: renovar con otro servidor devuelve null y no cambia nada",
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
            await getSessionInstants(
                session.id
            );

        const otroServidor =
            await createTestServer({
                userId: user.id
            });

        trackServer(otroServidor.id);

        const renovada =
            await refreshAdminSession(
                user.id,
                otroServidor.id,
                session.token
            );

        assert.equal(
            renovada,
            null
        );

        const despues =
            await getSessionInstants(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

    }
);

test(
    "CASO 14: renovar con un token inexistente devuelve null y no cambia nada",
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
            await getSessionInstants(
                session.id
            );

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                crypto
                    .randomBytes(32)
                    .toString("hex")
            );

        assert.equal(
            renovada,
            null
        );

        const despues =
            await getSessionInstants(
                session.id
            );

        assert.equal(
            despues.expires_at,
            antes.expires_at
        );

        assert.equal(
            despues.token,
            session.token
        );

    }
);

test(
    "CASO 15: una sesion expirada no se revive",
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

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                expirada.token
            );

        assert.equal(
            renovada,
            null
        );

        /**
         * La fila sigue igual: ni se revive ni se borra.
         */
        const estado =
            await getAbsoluteLimitState(
                expirada.id
            );

        assert.equal(
            estado.still_valid,
            false
        );

        assert.equal(
            await getSessionCountByToken(
                expirada.token
            ),
            1
        );

    }
);

test(
    "CASO 16: una sesion eliminada no se puede renovar",
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

        const borrada =
            await deleteAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(borrada, true);

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(
            renovada,
            null,
            "no debe recrear la sesion"
        );

        assert.equal(
            await getSessionCountByToken(
                session.token
            ),
            0
        );

    }
);

test(
    "CASO 17: con el limite absoluto vencido no se renueva aunque expires_at siga en el futuro",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        /**
         * created_at hace mas de 2 horas y expires_at sigue
         * en el futuro. Un expires_at vigente NO basta para
         * renovar.
         */
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

        const estadoPrevio =
            await getAbsoluteLimitState(
                vencida.id
            );

        assert.equal(
            estadoPrevio.still_valid,
            true,
            "la sesion parece vigente"
        );

        assert.equal(
            estadoPrevio.absolute_still_open,
            false,
            "pero el limite absoluto ya termino"
        );

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                vencida.token
            );

        assert.equal(
            renovada,
            null
        );

    }
);

test(
    "CASO 18: cerca del limite absoluto la renovacion queda topeada",
    async () => {

        const {
            user,
            server
        } =
            await createScenario();

        /**
         * created_at hace 1 hora y 55 minutos: quedan 5
         * minutos para el maximo absoluto, muy por debajo de
         * los 15 minutos de extension.
         */
        const cerca =
            await createSessionFixture({
                userId: user.id,
                serverId: server.id,
                expiresAt:
                    new Date(
                        Date.now() +
                        4 * 60 * 1000
                    ),
                createdAt:
                    new Date(
                        Date.now() -
                        (
                            60 * 60 * 1000 +
                            55 * 60 * 1000
                        )
                    )
            });

        const previa =
            await getAbsoluteLimitState(
                cerca.id
            );

        assert.equal(
            previa.absolute_still_open,
            true
        );

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                cerca.token
            );

        assert.ok(
            renovada,
            "la renovacion funciona si el limite " +
            "aun no termina"
        );

        const limite =
            await getAbsoluteLimitState(
                cerca.id
            );

        assert.equal(
            limite.limited_by_absolute,
            true,
            "expires_at debe quedar exactamente en " +
            "created_at + 2 horas"
        );

        assert.equal(
            limite.extended_15_minutes,
            false,
            "no debe quedar 15 minutos despues, " +
            "porque eso superaria las 2 horas"
        );

        assert.equal(
            limite.still_valid,
            true
        );

    }
);

test(
    "CASO 19: renovaciones sucesivas no crean filas ni superan el limite",
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

        const conteoInicial =
            await pool.query(
                `
                SELECT count(*)::int AS total
                FROM admin_sessions
                WHERE user_id = $1
                AND server_id = $2
                `,
                [user.id, server.id]
            );

        assert.equal(
            conteoInicial.rows[0].total,
            1
        );

        let ultima =
            await getSessionInstants(
                session.id
            );

        for (
            let vuelta = 0;
            vuelta < 4;
            vuelta += 1
        ) {

            const renovada =
                await refreshAdminSession(
                    user.id,
                    server.id,
                    session.token
                );

            assert.ok(renovada);

            const ahora =
                await getSessionInstants(
                    session.id
                );

            assert.ok(
                ahora.expires_at >
                    ahora.created_at
            );

            assert.ok(
                ahora.expires_at >=
                    ultima.expires_at,
                "cada renovacion no debe retroceder"
            );

            assert.equal(
                ahora.token,
                session.token
            );

            ultima = ahora;

        }

        const limite =
            await getAbsoluteLimitState(
                session.id
            );

        assert.equal(
            limite.limited_by_absolute,
            false
        );

        assert.equal(
            limite.still_valid,
            true
        );

        const conteoFinal =
            await pool.query(
                `
                SELECT count(*)::int AS total
                FROM admin_sessions
                WHERE user_id = $1
                AND server_id = $2
                `,
                [user.id, server.id]
            );

        assert.equal(
            conteoFinal.rows[0].total,
            1,
            "sigue habiendo una sola sesion"
        );

    }
);
