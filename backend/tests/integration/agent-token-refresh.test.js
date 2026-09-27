/**
 * RENOVACION DE CREDENCIALES DEL AGENTE.
 *
 * agent.service.refreshToken genera un agentToken y un
 * agentSecret nuevos y los devuelve al agente que realizo
 * una renovacion autorizada. Antes, ademas, persistia el
 * nuevo token completo en el evento AGENT_TOKEN_REFRESHED
 * de audit_logs, dejando una credencial utilizable en una
 * tabla de auditoria.
 *
 * Lo que se fija aqui:
 *
 * - El contrato con el agente legitimo se conserva: siguen
 *   devolviendo agentToken y agentSecret.
 * - La fila agents queda actualizada con las credenciales
 *   nuevas.
 * - El evento de auditoria identifica que agente renovo y
 *   cuando expiran las credenciales, sin persistir el token
 *   ni el secreto.
 * - Ninguna fila de audit_logs contiene las credenciales
 *   nuevas.
 *
 * Ninguna asercion imprime ni compara el valor de una
 * credencial cuando el fallo pudiera exponerlo: los tokens y
 * secretos solo se usan como argumento de busquedas
 * parametrizadas que devuelven un conteo.
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
    createTestAgent,
    cleanupTestData,
    closeTestPool
} = require("../helpers/database.helper");

const {
    refreshToken
} = require("../../src/services/agent.service");

const TEST_DATABASE_NAME =
    "serverhub_test";

const TOKEN_REFRESHED_EVENT =
    "AGENT_TOKEN_REFRESHED";

/**
 * Credenciales de agente que no deben persistirse en
 * auditoria bajo ningun nombre.
 */
const FORBIDDEN_DETAIL_PROPERTIES = [
    "newToken",
    "agentToken",
    "agentSecret",
    "oldToken",
    "token",
    "secret"
];

const trackedUserIds = [];

const trackedServerIds = [];

const trackedAgentIds = [];

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

function trackAgent(agentId) {

    trackedAgentIds.push(
        Number(agentId)
    );

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
    trackedAgentIds.length = 0;

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
        agentIds:
            [
                ...trackedAgentIds
            ]
    });

});

after(async () => {

    await closeTestPool();

});

async function getAgentRow(agentId) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                id,
                agent_token,
                agent_secret,
                token_expires_at
            FROM agents
            WHERE id = $1
            `,
            [agentId]
        );

    return result.rows[0];

}

async function getRefreshEventsForAgent(
    agentId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT id, event_type, details
            FROM audit_logs
            WHERE event_type = $1
            AND details->>'agentId' = $2
            ORDER BY id ASC
            `,
            [
                TOKEN_REFRESHED_EVENT,
                String(agentId)
            ]
        );

    return result.rows;

}

/**
 * Busqueda negativa de un secreto en toda la auditoria.
 * Usa position() para no depender de escapar caracteres de
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

async function createAgentFixture() {

    const user =
        await createTestUser();

    trackUser(user.id);

    const server =
        await createTestServer({
            userId: user.id
        });

    trackServer(server.id);

    const initialExpiry =
        new Date(
            Date.now() +
            60 * 60 * 1000
        );

    const agent =
        await createTestAgent({
            serverId: server.id,
            tokenExpiresAt:
                initialExpiry
        });

    trackAgent(agent.id);

    return {
        user,
        server,
        agent
    };

}

test(
    "refreshToken renueva las credenciales sin " +
    "persistirlas en la auditoria",
    async () => {

        const { agent } =
            await createAgentFixture();

        const previousToken =
            agent.agent_token;

        const previousSecret =
            agent.agent_secret;

        const previousExpiry =
            agent.token_expires_at;

        assert.equal(
            typeof previousToken,
            "string"
        );

        assert.ok(
            previousToken.length > 0
        );

        const refreshed =
            await refreshToken(
                agent.id
            );

        /**
         * El contrato con el agente legitimo se conserva.
         * Solo se comprueba el tipo y la longitud, nunca el
         * valor, para que un fallo no exponga la credencial.
         */
        assert.equal(
            typeof refreshed.agentToken,
            "string"
        );

        assert.ok(
            refreshed.agentToken.length > 0
        );

        assert.equal(
            typeof refreshed.agentSecret,
            "string"
        );

        assert.ok(
            refreshed.agentSecret.length > 0
        );

        assert.ok(
            refreshed.expiresAt instanceof Date
        );

        // El token y el secreto nuevos son distintos.
        assert.notEqual(
            refreshed.agentToken,
            previousToken
        );

        assert.notEqual(
            refreshed.agentSecret,
            previousSecret
        );

        // La fila agents quedo actualizada.
        const stored =
            await getAgentRow(
                agent.id
            );

        assert.equal(
            stored.agent_token,
            refreshed.agentToken
        );

        assert.equal(
            stored.agent_secret,
            refreshed.agentSecret
        );

        const storedExpiry =
            new Date(
                stored.token_expires_at
            ).getTime();

        const previousExpiryTime =
            new Date(
                previousExpiry
            ).getTime();

        assert.ok(
            storedExpiry >
                previousExpiryTime,
            "token_expires_at debe haber avanzado"
        );

        // Existe exactamente un evento de renovacion.
        const events =
            await getRefreshEventsForAgent(
                agent.id
            );

        assert.equal(
            events.length,
            1
        );

        const details =
            events[0].details;

        assert.equal(
            String(
                details.agentId
            ),
            String(agent.id)
        );

        assert.ok(
            details.expiresAt,
            "expiresAt debe conservarse"
        );

        // Ninguna propiedad de credencial en details.
        for (
            const property of
            FORBIDDEN_DETAIL_PROPERTIES
        ) {

            assert.equal(
                hasOwnProperty(
                    details,
                    property
                ),
                false,
                `details no debe tener la propiedad ` +
                `"${property}"`
            );

        }

        const serialized =
            JSON.stringify(details);

        assert.equal(
            serialized.includes(
                refreshed.agentToken
            ),
            false,
            "el JSON no debe contener el token nuevo"
        );

        assert.equal(
            serialized.includes(
                refreshed.agentSecret
            ),
            false,
            "el JSON no debe contener el secreto nuevo"
        );

        // Busqueda negativa sobre toda la auditoria.
        assert.equal(
            await countAuditRowsContaining(
                refreshed.agentToken
            ),
            0,
            "audit_logs no debe contener el token nuevo"
        );

        assert.equal(
            await countAuditRowsContaining(
                refreshed.agentSecret
            ),
            0,
            "audit_logs no debe contener el secreto nuevo"
        );

    }
);

test(
    "la renovacion repetida no acumula credenciales en la auditoria",
    async () => {

        const { agent } =
            await createAgentFixture();

        const tokens = [];
        const secrets = [];

        for (
            let intento = 0;
            intento < 3;
            intento += 1
        ) {

            const refreshed =
                await refreshToken(
                    agent.id
                );

            tokens.push(
                refreshed.agentToken
            );

            secrets.push(
                refreshed.agentSecret
            );

        }

        assert.equal(
            tokens.length,
            3
        );

        assert.equal(
            new Set(tokens).size,
            3,
            "cada renovacion debe emitir un token distinto"
        );

        assert.equal(
            new Set(secrets).size,
            3,
            "cada renovacion debe emitir un secreto distinto"
        );

        const events =
            await getRefreshEventsForAgent(
                agent.id
            );

        assert.equal(
            events.length,
            3
        );

        for (
            const event of events
        ) {

            const serialized =
                JSON.stringify(
                    event.details
                );

            for (
                const token of tokens
            ) {

                assert.equal(
                    serialized.includes(token),
                    false,
                    "ninguna renovacion puede persistir " +
                    "un token en la auditoria"
                );

            }

            for (
                const secret of secrets
            ) {

                assert.equal(
                    serialized.includes(secret),
                    false,
                    "ninguna renovacion puede persistir " +
                    "un secreto en la auditoria"
                );

            }

        }

        for (
            const token of tokens
        ) {

            assert.equal(
                await countAuditRowsContaining(
                    token
                ),
                0
            );

        }

        for (
            const secret of secrets
        ) {

            assert.equal(
                await countAuditRowsContaining(
                    secret
                ),
                0
            );

        }

    }
);
