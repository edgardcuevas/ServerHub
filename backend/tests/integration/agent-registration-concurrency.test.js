/**
 * CONSUMO CONCURRENTE de una registrationKey.
 *
 * Dos solicitudes intentan registrar dos agentes con la
 * misma clave al mismo tiempo.
 *
 * QUE SE COMPRUEBA
 *
 * Que la segunda transaccion se serialice detras de la
 * primera y rechace por la regla de negocio, con el mensaje
 * exacto "Clave ya utilizada", sin que ninguna colision de
 * indice unico llegue al cliente.
 *
 * QUE SE COMPROBABA ANTES
 *
 * La caracterizacion previa mostro que registerAgent hacia
 * check-then-act: el SELECT de la clave no bloqueaba la
 * fila, asi que dos transacciones en read committed podian
 * leer is_used en false antes de que ninguna escribiera.
 * La segunda se bloqueaba en agents.server_id UNIQUE y
 * fallaba con 23505, cuyo mensaje crudo
 *
 *   duplicate key value violates unique constraint
 *   "agents_server_id_key"
 *
 * llegaba tal cual al cliente HTTP a traves de
 * agent.controller. Con una ventana de un viaje de red, el
 * defecto era intermitente: 16 de 16 ejecuciones reales
 * ganaba el chequeo de negocio, pero una sonda con 300 ms
 * entre el SELECT y el INSERT reprodujo el 23505 de forma
 * fiable.
 *
 * CORRECCIONES APLICADAS
 *
 * 1. FOR UPDATE sobre el SELECT de registration_keys. Ahora la
 *    segunda transaccion espera el COMMIT de la primera y
 *    relee is_used en true, con lo que el rechazo lo decide
 *    el codigo y no el indice. agents.server_id UNIQUE sigue
 *    intacto como segunda defensa.
 *
 * 2. UPDATE condicional con AND is_used = false y
 *    comprobacion de rowCount !== 1. Es una tercera defensa
 *    de profundidad: el consumo de la clave queda ligado al
 *    propio UPDATE y no solo a la validacion en JavaScript.
 *
 * ALCANCE DE ESA TERCERA DEFENSA
 *
 * Despues de FOR UPDATE, rowCount = 0 es inalcanzable por la
 * API publica. Si se llega al UPDATE, la fila sigue
 * bloqueada por esta misma transaccion, nadie mas puede
 * haberla marcado y key.is_used era false al leerla. Por eso
 * no se puede disparar el caso con ganchos, delays ni
 * simulacion sin contaminar el codigo productivo, y no se
 * hace. La defense se verifica por inspeccion estatica, por
 * las pruebas concurrentes reales de este archivo y por la
 * segunda prueba de mas abajo, que demuestra su efecto
 * observable: un registro fallido no consume la clave.
 *
 * LO QUE ESTA PRUEBA EXIGE
 *
 * Exactamente una operacion cumplida y una rechazada, con
 * el mensaje de negocio exacto, sin 23505 y sin marcadores
 * internos de PostgreSQL, un solo agente, la clave usada,
 * un unico AGENT_REGISTERED y un unico REGISTRATION_KEY_USED,
 * y sin datos parciales ni credenciales adicionales.
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
    createKey
} = require(
    "../../src/services/registration-key.service"
);

const {
    registerAgent
} = require("../../src/services/agent.service");

const TEST_DATABASE_NAME =
    "serverhub_test";

const AGENT_REGISTERED_EVENT =
    "AGENT_REGISTERED";

const REGISTRATION_KEY_USED_EVENT =
    "REGISTRATION_KEY_USED";

const ALREADY_USED_ERROR =
    "Clave ya utilizada";

const UNIQUE_VIOLATION_CODE =
    "23505";

/**
 * Ninguno de estos marcadores puede llegar al cliente: si
 * aparecen, el rechazo viene de una colision de indice unico
 * y no de la regla de negocio.
 */
const UNIQUE_VIOLATION_MARKERS = [
    "agents_server_id_key",
    "duplicate key",
    "violates unique constraint"
];

/**
 * Error de negocio que debe recibir el llamador cuando el
 * servidor ya tiene un agente.
 */
const AGENT_CONFLICT_ERROR =
    "Este servidor ya tiene un agente vinculado";

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

/**
 * Sustituye cualquier secreto por un marcador para que el
 * diagnostico pueda imprimirse sin filtrar nada.
 */
function sanitize(text, secrets) {

    let result =
        String(text);

    for (
        const secret of secrets
    ) {

        if (
            secret &&
            typeof secret === "string"
        ) {

            result =
                result.split(
                    secret
                ).join(
                    "[REDACTADO]"
                );

        }

    }

    return result
        .replace(
            /\s+/g,
            " "
        )
        .trim();

}

function classifyRejection(error) {

    if (
        error &&
        error.code === "23505"
    ) {

        if (
            error.constraint ===
            "agents_server_id_key"
        ) {

            return "UNIQUE de agents.server_id";

        }

        return "UNIQUE de " + error.constraint;

    }

    if (
        error &&
        error.code === "23514"
    ) {

        return "CHECK";

    }

    if (
        error &&
        typeof error.message === "string" &&
        error.message.includes(
            "Clave ya utilizada"
        )
    ) {

        return "Clave utilizada (regla de negocio)";

    }

    if (
        error &&
        error.message ===
        AGENT_CONFLICT_ERROR
    ) {

        return "23505 normalizado a error de negocio";

    }

    return "Otra causa";

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

async function getAgentsOfServer(
    serverId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                id,
                server_id,
                hostname,
                version
            FROM agents
            WHERE server_id = $1
            ORDER BY id ASC
            `,
            [serverId]
        );

    return result.rows;

}

async function countAgentsWithHostname(
    hostname
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM agents
            WHERE hostname = $1
            `,
            [hostname]
        );

    return result.rows[0].total;

}

async function countServersWithSeveralAgents() {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM (
                SELECT server_id
                FROM agents
                GROUP BY server_id
                HAVING count(*) > 1
            ) AS duplicados
            `
        );

    return result.rows[0].total;

}

async function countEventsForServer(
    eventType,
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
                eventType,
                String(serverId)
            ]
        );

    return result.rows[0].total;

}

async function countEventsForKey(
    eventType,
    keyId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = $1
            AND details->>'registrationKeyId' = $2
            `,
            [
                eventType,
                String(keyId)
            ]
        );

    return result.rows[0].total;

}

async function getKeyState(keyId) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT id, user_id, server_id, is_used
            FROM registration_keys
            WHERE id = $1
            `,
            [keyId]
        );

    return result.rows[0];

}

async function createAgentPayload(
    registrationKey,
    suffix
) {

    return {
        registrationKey,
        hostname: `host-${suffix}`,
        version: "1.0.0",
        operatingSystem: "linux",
        architecture: "x64"
    };

}

/**
 * Detalles de los eventos de consumo asociados a una
 * clave. Se acota por registrationKeyId.
 */
async function getUsedEventsForKey(
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
                REGISTRATION_KEY_USED_EVENT,
                String(keyId)
            ]
        );

    return result.rows;

}

/**
 * Busqueda negativa del secreto en toda la auditoria. Usa
 * position() para no depender de escapar caracteres de
 * patron. El valor buscado jamas se imprime.
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

test(
    "dos agentes con la misma clave no producen doble agente",
    async t => {
        const user =
            await createTestUser();

        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });

        trackServer(server.id);

        const key =
            await createKey(
                user.id,
                server.id
            );

        const registrationKey =
            key.registration_key;

        const uniqueSuffix =
            crypto
                .randomUUID()
                .replace(
                    /-/g,
                    ""
                )
                .slice(0, 8);

        const payloadA = {
            registrationKey,
            hostname:
                `host-concurrencia-a-${uniqueSuffix}`,
            version: "1.0.0",
            operatingSystem: "linux",
            architecture: "x64"
        };

        const payloadB = {
            registrationKey,
            hostname:
                `host-concurrencia-b-${uniqueSuffix}`,
            version: "1.0.0",
            operatingSystem: "linux",
            architecture: "x64"
        };

        /**
         * Ambas llamadas se inician en el mismo bloque
         * concurrente: ninguna espera a la otra.
         */
        const results =
            await Promise.allSettled(
                [
                    registerAgent(payloadA),
                    registerAgent(payloadB)
                ]
            );

        const fulfilled =
            results.filter(
                item =>
                    item.status === "fulfilled"
            );

        const rejected =
            results.filter(
                item =>
                    item.status === "rejected"
            );

        const rejectedIndex =
            results.findIndex(
                item =>
                    item.status === "rejected"
            );

        const rejectedLabel =
            rejectedIndex === 0
                ? "A"
                : "B";

        const fulfilledLabel =
            rejectedIndex === 0
                ? "B"
                : "A";

        const rejection =
            rejected[0].reason;

        const winner =
            fulfilled[0].value;

        const secrets = [
            registrationKey,
            winner.agentToken,
            winner.agentSecret
        ];

        t.diagnostic(
            `CUMPLIDAS=${fulfilled.length} ` +
            `RECHAZADAS=${rejected.length} ` +
            `gano=${fulfilledLabel} perdio=${rejectedLabel}`
        );

        t.diagnostic(
            `ERROR_TIPO=${rejection &&
                rejection.constructor &&
                rejection.constructor.name}` +
            ` NOMBRE=${rejection && rejection.name}` +
            ` CODIGO_PG=${rejection ?
                (rejection.code || "ninguno") :
                "ninguno"}` +
            ` RESTRICCION=${rejection &&
                (rejection.constraint || "ninguna")}` +
            ` CAUSA=${classifyRejection(rejection)}`
        );

        t.diagnostic(
            "MENSAJE_SANITIZADO=" +
            sanitize(
                rejection && rejection.message,
                secrets
            )
        );

        // 1. Exactamente una operacion se cumple.
        assert.equal(
            fulfilled.length,
            1,
            "exactamente una operacion debe cumplirse"
        );

        // 2. Exactamente una operacion se rechaza.
        assert.equal(
            rejected.length,
            1,
            "exactamente una operacion debe rechazarse"
        );

        // 3. El rechazo es la regla de negocio, no una
        // colision de indice unico.
        assert.equal(
            rejection.message,
            ALREADY_USED_ERROR,
            "el rechazo debe ser exactamente " +
            `"${ALREADY_USED_ERROR}"`
        );

        // 4. Sin codigo de violacion de unicidad.
        assert.notEqual(
            rejection.code,
            UNIQUE_VIOLATION_CODE,
            "el rechazo no debe ser un 23505"
        );

        // 5. Sin detalle interno de PostgreSQL.
        const mensajeSaneado =
            sanitize(
                rejection.message,
                secrets
            );

        for (
            const marker of
            UNIQUE_VIOLATION_MARKERS
        ) {

            assert.ok(
                !mensajeSaneado
                    .toLowerCase()
                    .includes(
                        marker
                    ),
                `el mensaje no debe revelar ` +
                `"${marker}"`
            );

        }

        // 6. Existe exactamente un agente en el servidor.
        const agents =
            await getAgentsOfServer(
                server.id
            );

        assert.equal(
            agents.length,
            1,
            "debe existir exactamente un agente"
        );

        assert.equal(
            agents[0].id,
            winner.agentId
        );

        // 7. La clave queda utilizada.
        const keyState =
            await getKeyState(key.id);

        assert.equal(
            keyState.is_used,
            true
        );

        // 8. Ningun servidor puede tener dos agentes.
        assert.equal(
            await countServersWithSeveralAgents(),
            0,
            "ningun servidor puede tener dos agentes"
        );

        // 9. Un solo AGENT_REGISTERED.
        assert.equal(
            await countEventsForServer(
                AGENT_REGISTERED_EVENT,
                server.id
            ),
            1
        );

        // 10. Un solo REGISTRATION_KEY_USED para la clave.
        assert.equal(
            await countEventsForKey(
                REGISTRATION_KEY_USED_EVENT,
                key.id
            ),
            1
        );

        // 11. La operacion rechazada no deja credenciales.
        const rejectedPayload =
            rejectedLabel === "A"
                ? payloadA
                : payloadB;

        assert.equal(
            await countAgentsWithHostname(
                rejectedPayload.hostname
            ),
            0,
            "el agente rechazado no debe persistir"
        );

        assert.equal(
            agents[0].hostname,
            fulfilledLabel === "A"
                ? payloadA.hostname
                : payloadB.hostname
        );

        // 12. La transaccion fallida no deja datos
        // parciales.
        assert.equal(
            await countEventsForServer(
                REGISTRATION_KEY_USED_EVENT,
                server.id
            ),
            1
        );

        const pool =
            getTestPool();

        const claves =
            await pool.query(
                `
                SELECT count(*)::int AS total
                FROM registration_keys
                WHERE server_id = $1
                `,
                [server.id]
            );

        assert.equal(
            claves.rows[0].total,
            1,
            "no debe haber claves duplicadas"
        );

    }
);

test(
    "un registro rechazado por UNIQUE no consume la clave",
    async t => {
        const user =
            await createTestUser();

        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });

        trackServer(server.id);

        const uniqueSuffix =
            crypto
                .randomUUID()
                .replace(
                    /-/g,
                    ""
                )
                .slice(0, 8);

        /**
         * Primer registro: deja el servidor con un agente y
         * consume la clave.
         */
        const key =
            await createKey(
                user.id,
                server.id
            );

        await registerAgent(
            await createAgentPayload(
                key.registration_key,
                `primero-${uniqueSuffix}`
            )
        );

        /**
         * createKey ya no emitiria una clave para este
         * servidor, porque comprueba que no tenga agente, y
         * ademas invalida las claves anteriores del mismo
         * servidor. Para reproducir la ventana que existia
         * antes del FOR UPDATE se devuelve la clave a su
         * estado inicial. Es el unico ajuste artificial de
         * esta prueba y no toca codigo productivo: emula el
         * instante en que dos transacciones ven is_used en
         * false.
         */
        const pool =
            getTestPool();

        await pool.query(
            `
            UPDATE registration_keys
            SET is_used = false
            WHERE id = $1
            `,
            [key.id]
        );

        let rejection;

        try {

            await registerAgent(
                await createAgentPayload(
                    key.registration_key,
                    `segundo-${uniqueSuffix}`
                )
            );

            throw new Error(
                "el servicio acepto un segundo agente " +
                "para el mismo servidor"
            );

        } catch (error) {

            rejection = error;

        }

        t.diagnostic(
            "SEGUNDO_REGISTRO " +
            `CODIGO_PG=${rejection.code || "ninguno"} ` +
            `RESTRICCION=${rejection.constraint || "ninguna"} ` +
            "CAUSA=" +
            classifyRejection(rejection)
        );

        t.diagnostic(
            "SEGUNDO_REGISTRO MENSAJE_SANITIZADO=" +
            sanitize(
                rejection.message,
                [key.registration_key]
            )
        );

        /**
         * El controlador responde con error.message, asi
         * que un 23505 crudo llegaria al cliente HTTP con
         * el nombre de la restriccion. registerAgent lo
         * traduce a un error de negocio.
         */
        assert.equal(
            rejection.message,
            AGENT_CONFLICT_ERROR,
            "debe ser exactamente el error de negocio"
        );

        assert.equal(
            rejection.message,
            "Este servidor ya tiene un agente vinculado"
        );

        for (
            const marker of
            UNIQUE_VIOLATION_MARKERS
        ) {

            assert.ok(
                !rejection.message
                    .toLowerCase()
                    .includes(
                        marker
                    ),
                `el mensaje no debe revelar ` +
                `"${marker}"`
            );

        }

        assert.equal(
            rejection.constraint,
            undefined,
            "no debe filtrar el nombre de la " +
            "restriccion"
        );

        assert.equal(
            rejection.code,
            undefined,
            "no debe filtrar el codigo SQLSTATE"
        );

        /**
         * El INSERT del agente choca con UNIQUE(server_id)
         * y el ROLLBACK deshace todo lo anterior a la
         * auditoria. La clave no debe consumirse, porque el
         * UPDATE condicional nunca llego a ejecutarse.
         */        const keyState =
            await getKeyState(
                key.id
            );

        assert.equal(
            keyState.is_used,
            false,
            "un registro fallido no debe consumir la clave"
        );

        // Sigue habiendo un unico agente.
        const agents =
            await getAgentsOfServer(
                server.id
            );

        assert.equal(
            agents.length,
            1,
            "debe seguir habiendo un solo agente"
        );

        assert.equal(
            await countServersWithSeveralAgents(),
            0
        );

        // El hostname del segundo intento no persiste.
        assert.equal(
            await countAgentsWithHostname(
                `host-segundo-${uniqueSuffix}`
            ),
            0
        );

        // No hay auditoria nueva: ni del key ni del servidor.
        assert.equal(
            await countEventsForKey(
                REGISTRATION_KEY_USED_EVENT,
                key.id
            ),
            1,
            "solo debe quedar el evento del primer registro"
        );

        assert.equal(
            await countEventsForServer(
                AGENT_REGISTERED_EVENT,
                server.id
            ),
            1,
            "solo debe quedar el evento del primer registro"
        );

    }
);

test(
    "REGISTRATION_KEY_USED se registra sin la clave completa",
    async () => {

        const user =
            await createTestUser();

        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });

        trackServer(server.id);

        const key =
            await createKey(
                user.id,
                server.id
            );

        const registrationKey =
            key.registration_key;

        /**
         * Regresion: registerAgent sigue aceptando la
         * clave completa y sigue devolviendo credenciales.
         * No se comprueba su valor para no exponerlo.
         */
        const registration =
            await registerAgent(
                await createAgentPayload(
                    registrationKey,
                    "auditoria"
                )
            );

        assert.equal(
            typeof registration.agentId,
            "number"
        );

        assert.equal(
            typeof registration.agentToken,
            "string"
        );

        assert.equal(
            typeof registration.agentSecret,
            "string"
        );

        const events =
            await getUsedEventsForKey(
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
            server.id
        );

        assert.equal(
            details.agentId,
            registration.agentId
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
