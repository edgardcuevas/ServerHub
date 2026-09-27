/**
 * Pruebas de integracion de registration-key.service.
 *
 * NATURALEZA DE ESTA PRUEBA
 *
 * Es una PRUEBA DE REGRESION, no una prueba de caracterizacion
 * de un defecto vivo:
 *
 * - El defecto de autorizacion fue identificado por AUDITORIA:
 *   createKey(userId, serverId) recibia userId pero no
 *   verificaba que el servidor perteneciera a ese usuario
 *   antes de generar la clave.
 * - La CORRECCION ya estaba aplicada en el working tree antes
 *   de incorporar esta prueba. No se modifico
 *   registration-key.service.js para escribirla y no se
 *   elimino temporalmente la comprobacion de propiedad.
 * - Lo que estas pruebas fijan es que esa correccion no se
 *   rompa: un usuario no puede crear una clave para un
 *   servidor ajeno, el mensaje es exactamente
 *   "Servidor no encontrado", no se crea registration_key,
 *   no se invalidan claves ajenas y no se genera auditoria
 *   REGISTRATION_KEY_CREATED.
 *
 * AISLAMIENTO
 *
 * - Se usa exclusivamente la base declarada en
 *   DATABASE_URL_TEST, validada por database.helper.js.
 * - Cada prueba crea sus propios usuarios y servidores con
 *   identificadores unicos.
 * - La limpieza se limita a los IDs creados por la prueba.
 *   No hay TRUNCATE, ni DROP, ni limpieza global.
 * - audit_logs no tiene clave foranea, por lo que se limpia
 *   de forma explicita por event_type y serverId.
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

/**
 * database.helper.js debe ser el primer require del archivo.
 * Inyecta la configuracion de la base de pruebas en
 * process.env antes de que se construya el Pool de
 * ../../src/config/db, que es un singleton de modulo.
 */
const {
    verifyTestConnection,
    getTestPool,
    createTestUser,
    createTestServer,
    createTestAgent,
    cleanupTestData,
    closeTestPool
} = require("../helpers/database.helper");

const {
    createKey
} = require(
    "../../src/services/registration-key.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const KEY_PATTERN =
    /^SHUB-[A-F0-9]{32}$/;

const EXPECTED_KEY_LENGTH =
    37;

const EXPECTED_TTL_SECONDS =
    24 * 60 * 60;

const MIN_REMAINING_SECONDS =
    23 * 60 * 60 + 59 * 60;

const MAX_REMAINING_SECONDS =
    24 * 60 * 60 + 30;

const MISSING_SERVER_ERROR =
    "Servidor no encontrado";

const AGENT_CONFLICT_ERROR =
    "Este servidor ya tiene un agente vinculado";

const KEY_CREATED_EVENT =
    "REGISTRATION_KEY_CREATED";

const UNREACHABLE_SERVER_ID =
    999999999;

const trackedUserIds = [];

const trackedServerIds = [];

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
            ]
    });

});

after(async () => {

    await closeTestPool();

});

async function createTwoUserScenario() {

    const userA =
        await createTestUser();

    const userB =
        await createTestUser();

    trackUser(userA.id);
    trackUser(userB.id);

    const serverA =
        await createTestServer({
            userId: userA.id
        });

    const serverB =
        await createTestServer({
            userId: userB.id
        });

    trackServer(serverA.id);
    trackServer(serverB.id);

    return {
        userA,
        userB,
        serverA,
        serverB
    };

}

async function getKeyRowById(keyId) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                id,
                user_id,
                server_id,
                registration_key,
                is_used,
                expires_at,
                created_at
            FROM registration_keys
            WHERE id = $1
            `,
            [keyId]
        );

    return result.rows[0];

}

async function getKeyRowsOfServer(
    serverId
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
                registration_key,
                is_used
            FROM registration_keys
            WHERE server_id = $1
            ORDER BY id ASC
            `,
            [serverId]
        );

    return result.rows;

}

async function countKeysForUserAndServer(
    userId,
    serverId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM registration_keys
            WHERE user_id = $1
            AND server_id = $2
            `,
            [
                userId,
                serverId
            ]
        );

    return result.rows[0].total;

}

async function countCreatedEventsForServer(
    serverId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = $1
            AND details->>'serverId' = $2
            `,
            [
                KEY_CREATED_EVENT,
                String(serverId)
            ]
        );

    return result.rows[0].total;

}

/**
 * Recuento acotado a los servidores que la prueba puede
 * referenciar.
 *
 * Antes se comparaba contra un recuento global de
 * REGISTRATION_KEY_CREATED. node --test ejecuta los archivos
 * de prueba en paralelo y todos comparten la misma base, de
 * modo que el recuento global incluyendo o excluyendo el
 * ciclo de vida del otro archivo y la asercion resultaba
 * intermitente. Acotar por serverId es mas estricto y no
 * depende de ninguna otra prueba.
 */
async function countCreatedEventsForServers(
    serverIds
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = $1
            AND details->>'serverId' = ANY($2::text[])
            `,
            [
                KEY_CREATED_EVENT,
                serverIds.map(
                    value =>
                        String(value)
                )
            ]
        );

    return result.rows[0].total;

}

/**
 * Detalles de los eventos de creacion asociados a una clave.
 * Se acota por registrationKeyId, nunca por recuento global.
 */
async function getCreatedEventsForKey(
    keyId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT id, event_type, details
            FROM audit_logs
            WHERE event_type = $1
            AND details->>'registrationKeyId' = $2
            ORDER BY id ASC
            `,
            [
                KEY_CREATED_EVENT,
                String(keyId)
            ]
        );

    return result.rows;

}

/**
 * Busqueda negativa del secreto en toda la tabla de
 * auditoria. Usa position() en lugar de LIKE para no
 * depender de escapar caracteres de patron. El valor
 * buscado jamas se imprime.
 */
async function countAuditRowsContaining(
    secret
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE position(
                $1 in details::text
            ) > 0
            `,
            [secret]
        );

    return result.rows[0].total;

}

function hasOwnProperty(
    details,
    property
) {

    return Object.prototype
        .hasOwnProperty.call(
            details,
            property
        );

}

/**
 * expires_at es "timestamp without time zone".
 *
 * node-postgres serializa un Date de JavaScript como hora
 * local con desplazamiento, y PostgreSQL descarta el
 * desplazamiento al guardar en una columna sin zona. Por
 * eso expires_at conserva la hora de pared local, que es la
 * misma base que usa CURRENT_TIMESTAMP para created_at.
 *
 * Toda la aritmetica de expiracion se resuelve en SQL para
 * no depender de como node-postgres interprete el valor.
 */
async function getExpiryState(keyId) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                expires_at > NOW() AS is_future,
                EXTRACT(
                    EPOCH FROM (
                        expires_at - NOW()
                    )
                ) AS remaining_seconds,
                EXTRACT(
                    EPOCH FROM (
                        expires_at - created_at
                    )
                ) AS ttl_seconds
            FROM registration_keys
            WHERE id = $1
            `,
            [keyId]
        );

    return result.rows[0];

}

/**
 * La medicion anterior solo es valida si Node y la sesion
 * de PostgreSQL comparten zona horaria. Si divergen, el
 * servicio sigue siendo correcto y la asercion no.
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

test(
    "el propietario puede crear una clave para su propio servidor",
    async () => {

        const {
            userA,
            serverA
        } =
            await createTwoUserScenario();

        const key =
            await createKey(
                userA.id,
                serverA.id
            );

        assert.ok(key);
        assert.equal(
            key.user_id,
            userA.id
        );
        assert.equal(
            key.server_id,
            serverA.id
        );
        assert.match(
            key.registration_key,
            KEY_PATTERN
        );
        assert.equal(
            key.registration_key.length,
            EXPECTED_KEY_LENGTH
        );
        assert.equal(
            key.is_used,
            false
        );

        const stored =
            await getKeyRowById(
                key.id
            );

        assert.ok(stored);
        assert.equal(
            stored.user_id,
            userA.id
        );
        assert.equal(
            stored.server_id,
            serverA.id
        );
        assert.equal(
            stored.registration_key,
            key.registration_key
        );
        assert.equal(
            stored.is_used,
            false
        );

        const expiry =
            await getExpiryState(
                key.id
            );

        assert.equal(
            expiry.is_future,
            true,
            "la expiración debe estar en el futuro"
        );

        const ttl =
            Number(expiry.ttl_seconds);

        assert.ok(
            ttl > MIN_REMAINING_SECONDS &&
                ttl < MAX_REMAINING_SECONDS,
            `la expiración debe fijarse a unas ` +
            `${EXPECTED_TTL_SECONDS}s tras la creación ` +
            `y el TTL medido fue de ${ttl}s`
        );

        const remaining =
            Number(
                expiry.remaining_seconds
            );

        assert.ok(
            remaining >
                MIN_REMAINING_SECONDS &&
                remaining <
                MAX_REMAINING_SECONDS,
            `la expiración debe conservarse a unas ` +
            `${EXPECTED_TTL_SECONDS}s y quedaban ` +
            `${remaining}s`
        );

    }
);

test(
    "un usuario no puede crear una clave para un servidor ajeno",
    async () => {

        const {
            userA,
            serverB
        } =
            await createTwoUserScenario();

        const eventsBefore =
            await countCreatedEventsForServers(
                [serverB.id]
            );

        await assert.rejects(
            () =>
                createKey(
                    userA.id,
                    serverB.id
                ),
            {
                message:
                    MISSING_SERVER_ERROR
            }
        );

        assert.equal(
            await countKeysForUserAndServer(
                userA.id,
                serverB.id
            ),
            0
        );

        assert.equal(
            await countCreatedEventsForServer(
                serverB.id
            ),
            0
        );

        assert.equal(
            await countCreatedEventsForServers(
                [serverB.id]
            ),
            eventsBefore
        );

    }
);

test(
    "un servidor inexistente devuelve exactamente " +
    '"Servidor no encontrado"',
    async () => {

        const { userA } =
            await createTwoUserScenario();

        const eventsBefore =
            await countCreatedEventsForServers(
                [UNREACHABLE_SERVER_ID]
            );

        await assert.rejects(
            () =>
                createKey(
                    userA.id,
                    UNREACHABLE_SERVER_ID
                ),
            {
                message:
                    MISSING_SERVER_ERROR
            }
        );

        assert.equal(
            await countKeysForUserAndServer(
                userA.id,
                UNREACHABLE_SERVER_ID
            ),
            0
        );

        assert.equal(
            await countCreatedEventsForServers(
                [UNREACHABLE_SERVER_ID]
            ),
            eventsBefore
        );

    }
);

test(
    "un servidor con agente devuelve exactamente " +
    '"Este servidor ya tiene un agente vinculado"',
    async () => {

        const {
            userA,
            serverA
        } =
            await createTwoUserScenario();

        await createTestAgent({
            serverId: serverA.id
        });

        const eventsBefore =
            await countCreatedEventsForServers(
                [serverA.id]
            );

        await assert.rejects(
            () =>
                createKey(
                    userA.id,
                    serverA.id
                ),
            {
                message:
                    AGENT_CONFLICT_ERROR
            }
        );

        assert.equal(
            await countKeysForUserAndServer(
                userA.id,
                serverA.id
            ),
            0
        );

        assert.equal(
            await countCreatedEventsForServers(
                [serverA.id]
            ),
            eventsBefore
        );

    }
);

test(
    "crear una segunda clave invalida la primera",
    async () => {

        const {
            userA,
            serverA
        } =
            await createTwoUserScenario();

        const firstKey =
            await createKey(
                userA.id,
                serverA.id
            );

        const secondKey =
            await createKey(
                userA.id,
                serverA.id
            );

        const storedFirst =
            await getKeyRowById(
                firstKey.id
            );

        const storedSecond =
            await getKeyRowById(
                secondKey.id
            );

        assert.equal(
            storedFirst.is_used,
            true
        );

        assert.equal(
            storedSecond.is_used,
            false
        );

        assert.notEqual(
            storedFirst.registration_key,
            storedSecond.registration_key
        );

        assert.match(
            storedSecond.registration_key,
            KEY_PATTERN
        );

        assert.equal(
            storedSecond.registration_key.length,
            EXPECTED_KEY_LENGTH
        );

        const serverKeys =
            await getKeyRowsOfServer(
                serverA.id
            );

        assert.equal(
            serverKeys.length,
            2
        );

        const activeKeys =
            serverKeys.filter(
                key => !key.is_used
            );

        assert.equal(
            activeKeys.length,
            1
        );

        assert.equal(
            activeKeys[0].id,
            secondKey.id
        );

    }
);

test(
    "no se crea REGISTRATION_KEY_CREATED al rechazar un servidor ajeno o inexistente",
    async () => {

        const {
            userA,
            userB,
            serverA,
            serverB
        } =
            await createTwoUserScenario();

        /**
         * Control positivo: demuestra que la auditoria si se
         * escribe cuando la operacion tiene exito, de modo que
         * las aserciones negativas siguientes no son vacias.
         */
        await createKey(
            userA.id,
            serverA.id
        );

        assert.equal(
            await countCreatedEventsForServer(
                serverA.id
            ),
            1
        );

        await createKey(
            userB.id,
            serverB.id
        );

        const eventsBefore =
            await countCreatedEventsForServers(
                [
                    serverA.id,
                    serverB.id,
                    UNREACHABLE_SERVER_ID
                ]
            );

        await assert.rejects(
            () =>
                createKey(
                    userA.id,
                    serverB.id
                ),
            {
                message:
                    MISSING_SERVER_ERROR
            }
        );

        await assert.rejects(
            () =>
                createKey(
                    userA.id,
                    UNREACHABLE_SERVER_ID
                ),
            {
                message:
                    MISSING_SERVER_ERROR
            }
        );

        assert.equal(
            await countCreatedEventsForServers(
                [
                    serverA.id,
                    serverB.id,
                    UNREACHABLE_SERVER_ID
                ]
            ),
            eventsBefore
        );

        assert.equal(
            await countCreatedEventsForServer(
                serverB.id
            ),
            1
        );

    }
);

test(
    "REGISTRATION_KEY_CREATED se registra sin la clave completa",
    async () => {

        const {
            userA,
            serverA
        } =
            await createTwoUserScenario();

        const key =
            await createKey(
                userA.id,
                serverA.id
            );

        const registrationKey =
            key.registration_key;

        /**
         * Regresion: la respuesta autorizada sigue
         * llevando la clave, porque el usuario necesita
         * copiarla para registrar el agente.
         */
        assert.match(
            registrationKey,
            KEY_PATTERN
        );

        assert.equal(
            registrationKey.length,
            EXPECTED_KEY_LENGTH
        );

        /**
         * La clave sigue almacenada en claro en
         * registration_keys por ahora.
         */
        const stored =
            await getKeyRowById(
                key.id
            );

        assert.equal(
            stored.registration_key,
            registrationKey
        );

        const events =
            await getCreatedEventsForKey(
                key.id
            );

        assert.equal(
            events.length,
            1
        );

        const details =
            events[0].details;

        assert.equal(
            String(
                details.registrationKeyId
            ),
            String(key.id)
        );

        assert.equal(
            details.serverId,
            serverA.id
        );

        assert.ok(
            details.expiresAt,
            "expiresAt debe conservarse"
        );

        assert.equal(
            hasOwnProperty(
                details,
                "registrationKey"
            ),
            false,
            "details no debe tener la propiedad " +
            "registrationKey"
        );

        assert.equal(
            JSON.stringify(details).includes(
                registrationKey
            ),
            false,
            "el JSON de details no debe contener " +
            "la clave completa"
        );

        assert.equal(
            await countAuditRowsContaining(
                registrationKey
            ),
            0,
            "audit_logs no debe contener la clave " +
            "completa en ninguna fila"
        );

    }
);

test(
    "no se invalidan claves existentes del servidor ajeno",
    async () => {

        const {
            userA,
            userB,
            serverB
        } =
            await createTwoUserScenario();

        const keyOfUserB =
            await createKey(
                userB.id,
                serverB.id
            );

        const before =
            await getKeyRowById(
                keyOfUserB.id
            );

        assert.equal(
            before.is_used,
            false
        );

        await assert.rejects(
            () =>
                createKey(
                    userA.id,
                    serverB.id
                ),
            {
                message:
                    MISSING_SERVER_ERROR
            }
        );

        const after =
            await getKeyRowById(
                keyOfUserB.id
            );

        assert.equal(
            after.is_used,
            false
        );

        assert.equal(
            after.registration_key,
            before.registration_key
        );

        const serverKeys =
            await getKeyRowsOfServer(
                serverB.id
            );

        assert.equal(
            serverKeys.length,
            1
        );

        assert.equal(
            serverKeys[0].user_id,
            userB.id
        );

        assert.equal(
            serverKeys.filter(
                key => !key.is_used
            ).length,
            1
        );

    }
);
