/**
 * Infraestructura segura de pruebas de integracion.
 *
 * Responsabilidades:
 * - Resolver la configuracion de la base de pruebas desde
 *   DATABASE_URL_TEST, jamas desde DATABASE_URL.
 * - Rechazar la ejecucion si la base no es demostrablemente
 *   una base exclusiva de pruebas.
 * - Inyectar la configuracion en el Pool singleton de
 *   ../../src/config/db antes de que este se construya.
 * - Verificar en runtime que la conexion real apunta a la
 *   base de pruebas.
 * - Ofrecer fixtures y limpieza limitada a los IDs creados
 *   por cada prueba.
 *
 * NO se usan variables PGHOST, PGPORT, PGDATABASE, PGUSER
 * ni PGPASSWORD de forma deliberada: la politica exige que
 * la base de pruebas se declare unicamente en
 * DATABASE_URL_TEST.
 *
 * RESTRICCION DE ORDEN DE REQUIRE:
 * este archivo debe ser el primer require del archivo de
 * prueba, antes de requerir el servicio a probar.
 */

const path = require("path");

const crypto =
    require("crypto");

/**
 * ../../src/config/env invoca dotenv sin quiet, y se carga
 * en cuanto se requiere ../../src/config/db. Como el servicio
 * a probar requiere ese modulo en su primera linea, esta
 * variable debe fijarse al cargar el helper, antes de
 * cualquier require de codigo productivo.
 */
process.env.DOTENV_CONFIG_QUIET =
    "true";

require("dotenv").config({
    path: path.resolve(
        __dirname,
        "..",
        "..",
        ".env"
    ),
    quiet: true
});

const REQUIRED_TEST_INDICATORS = [
    "test",
    "testing"
];

const PRODUCTION_MARKERS = [
    "prod",
    "postgres"
];

const TEST_SUFFIX_PATTERN =
    /[_-]?test(ing)?$/;

const SUPPORTED_PROTOCOLS = [
    "postgres:",
    "postgresql:"
];

/**
 * Eventos de auditoria que_cleanupTestData puede eliminar.
 * Todos ellos incluyen serverId en details, que es lo que
 * acota el borrado a los servidores de la prueba.
 *
 * AGENT_REGISTERED lo emite agent.service.registerAgent y
 * debe estar incluido: si falta, cada prueba de registro de
 * agente deja una fila huerfana en audit_logs, que no tiene
 * clave foranea ni se limpia en cascada.
 */
const REGISTRATION_KEY_EVENTS = [
    "REGISTRATION_KEY_CREATED",
    "REGISTRATION_KEY_USED",
    "AGENT_REGISTERED"
];

/**
 * Evento que se identifica por agentId. agent.service
 * .refreshToken lo emite con details { agentId, expiresAt }
 * y sin serverId, de modo que la limpieza por servidor no
 * lo alcanza y necesita su propio borrado acotado.
 */
const AGENT_TOKEN_REFRESHED_EVENT =
    "AGENT_TOKEN_REFRESHED";

const SAFE_ERROR_MESSAGE =
    "Las pruebas de integración requieren una base de datos exclusiva configurada en DATABASE_URL_TEST";

const TEST_APPLICATION_NAME =
    "serverhub-integration-test";

/**
 * Solo informacion no sensible.
 * Nunca incluye usuario, contrasena ni la URL completa.
 */
function getSafeConfigurationSummary() {

    return {
        host: process.env.DB_HOST || null,
        port: process.env.DB_PORT || null,
        database: process.env.DB_NAME || null
    };

}

function readTestDatabaseUrl() {

    const raw =
        process.env.DATABASE_URL_TEST;

    if (
        typeof raw !== "string"
        || raw.trim() === ""
    ) {
        throw new Error(
            SAFE_ERROR_MESSAGE
        );
    }

    return raw.trim();

}

function parseTestDatabaseUrl(raw) {

    let parsed;

    try {

        parsed =
            new URL(
                raw
            );

    } catch (error) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    const protocol =
        parsed.protocol;

    if (
        !SUPPORTED_PROTOCOLS.includes(
            protocol
        )
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    const database =
        decodeURIComponent(
            parsed.pathname.replace(
                /^\//,
                ""
            )
        );

    const host =
        decodeURIComponent(
            parsed.hostname
        );

    if (
        host === ""
        || database === ""
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    const user =
        decodeURIComponent(
            parsed.username
        );

    const password =
        decodeURIComponent(
            parsed.password
        );

    if (
        user === ""
        || password === ""
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    return {
        protocol,
        host,
        port:
            parsed.port === ""
                ? "5432"
                : parsed.port,
        database,
        user,
        password
    };

}

function assertDatabaseNameIsSafe(
    database
) {

    const name =
        database
            .trim()
            .toLowerCase();

    if (
        name === ""
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    const developmentDatabaseName =
        (
            process.env.DB_NAME || ""
        )
            .trim()
            .toLowerCase();

    const developmentUrlDatabaseName =
        getDatabaseNameFromUrl(
            process.env.DATABASE_URL
        );

    const forbiddenNames = [
        developmentDatabaseName,
        developmentUrlDatabaseName
    ].filter(
        value =>
            typeof value === "string"
            && value !== ""
    );

    const matchesForbiddenName =
        forbiddenNames.some(
            forbidden =>
                forbidden.toLowerCase()
                === name
        );

    if (
        matchesForbiddenName
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    const hasTestIndicator =
        REQUIRED_TEST_INDICATORS.some(
            indicator =>
                name.includes(
                    indicator
                )
        );

    if (
        !hasTestIndicator
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    const hasProductionMarker =
        PRODUCTION_MARKERS.some(
            marker =>
                name.includes(
                    marker
                )
        );

    const endsWithTestToken =
        TEST_SUFFIX_PATTERN.test(
            name
        );

    if (
        hasProductionMarker
        && !endsWithTestToken
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

}

function getDatabaseNameFromUrl(raw) {

    if (
        typeof raw !== "string"
        || raw.trim() === ""
    ) {
        return null;
    }

    try {

        const parsed =
            new URL(
                raw.trim()
            );

        return decodeURIComponent(
            parsed.pathname.replace(
                /^\//,
                ""
            )
        );

    } catch (error) {

        return null;

    }

}

function configureEnvironment(
    testDatabase
) {

    process.env.DB_HOST =
        testDatabase.host;

    process.env.DB_PORT =
        testDatabase.port;

    process.env.DB_NAME =
        testDatabase.database;

    process.env.DB_USER =
        testDatabase.user;

    process.env.DB_PASSWORD =
        testDatabase.password;

    /**
     * node-postgres lee PGAPPNAME, de modo que las
     * conexiones de prueba quedan identificables en
     * pg_stat_activity.
     */
    process.env.PGAPPNAME =
        TEST_APPLICATION_NAME;

}

let resolvedDatabaseName = null;

let resolvedPool = null;

/**
 * Guardas ejecutadas al cargar este modulo.
 * Si algo falla, el archivo de prueba se detiene antes
 * de abrir cualquier conexion y antes de cualquier SQL.
 */
function resolveTestDatabase() {

    const raw =
        readTestDatabaseUrl();

    const parsed =
        parseTestDatabaseUrl(
            raw
        );

    assertDatabaseNameIsSafe(
        parsed.database
    );

    resolvedDatabaseName =
        parsed.database;

    configureEnvironment(
        parsed
    );

    return parsed;

}

resolveTestDatabase();

function getExpectedDatabaseName() {

    if (
        resolvedDatabaseName === null
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    return resolvedDatabaseName;

}

async function assertConnectedToTestDatabase(
    pool
) {

    const expected =
        getExpectedDatabaseName()
            .toLowerCase();

    const result =
        await pool.query(
            "SELECT current_database() AS database"
        );

    const current =
        String(
            result.rows[0].database
        ).toLowerCase();

    if (
        current !== expected
    ) {

        throw new Error(
            SAFE_ERROR_MESSAGE
        );

    }

    return result.rows[0].database;

}

/**
 * El Pool se carga de forma perezosa para garantizar que
 * la configuracion de la base de pruebas este inyectada
 * antes de que ../../src/config/db lo construya.
 * Es la misma instancia que usa el servicio a probar.
 */
function getTestPool() {

    if (
        resolvedPool === null
    ) {

        resolvedPool =
            require(
                "../../src/config/db"
            );

    }

    return resolvedPool;

}

async function verifyTestConnection() {

    const pool =
        getTestPool();

    await assertConnectedToTestDatabase(
        pool
    );

    const version =
        await pool.query(
            "SHOW server_version"
        );

    return {
        database:
            getExpectedDatabaseName(),
        serverVersion:
            version.rows[0].server_version
    };

}

async function createTestUser(
    options = {}
) {

    const pool =
        getTestPool();

    await assertConnectedToTestDatabase(
        pool
    );

    const uniqueSuffix =
        crypto
            .randomUUID()
            .replace(
                /-/g,
                ""
            );

    const name =
        options.name
        || `test-user-${uniqueSuffix}`;

    const email =
        options.email
        || `test-${uniqueSuffix}@serverhub.test`;

    const result =
        await pool.query(
            `
            INSERT INTO users
            (
                name,
                email,
                password_hash
            )
            VALUES ($1, $2, $3)
            RETURNING id, name, email
            `,
            [
                name,
                email,
                "test-hash-not-a-real-credential"
            ]
        );

    return result.rows[0];

}

async function createTestServer(
    options = {}
) {

    const pool =
        getTestPool();

    await assertConnectedToTestDatabase(
        pool
    );

    if (
        !options.userId
    ) {

        throw new Error(
            "createTestServer requiere userId"
        );

    }

    const uniqueSuffix =
        crypto
            .randomUUID()
            .replace(
                /-/g,
                ""
            );

    const name =
        options.name
        || `test-server-${uniqueSuffix}`;

    const result =
        await pool.query(
            `
            INSERT INTO servers
            (
                user_id,
                name,
                description
            )
            VALUES ($1, $2, $3)
            RETURNING id, user_id, name
            `,
            [
                options.userId,
                name,
                "servidor creado por pruebas de integracion"
            ]
        );

    return result.rows[0];

}

async function createTestAgent(
    options = {}
) {

    const pool =
        getTestPool();

    await assertConnectedToTestDatabase(
        pool
    );

    if (
        !options.serverId
    ) {

        throw new Error(
            "createTestAgent requiere serverId"
        );

    }

    const uniqueSuffix =
        crypto
            .randomUUID()
            .replace(
                /-/g,
                ""
            );

    const result =
        await pool.query(
            `
            INSERT INTO agents
            (
                server_id,
                agent_token,
                agent_secret,
                token_expires_at,
                version
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                server_id,
                agent_token,
                agent_secret,
                token_expires_at
            `,
            [
                options.serverId,
                `agt_test_${uniqueSuffix}`,
                `secret_test_${uniqueSuffix}`,
                options.tokenExpiresAt || null,
                "0.0.0-test"
            ]
        );

    return result.rows[0];

}

function normalizeIdList(ids) {

    if (
        !Array.isArray(ids)
    ) {
        return [];
    }

    return ids
        .filter(
            value =>
                Number.isInteger(value)
        )
        .map(
            value => Number(value)
        );

}

/**
 * Limpieza limitada a los IDs creados por la prueba.
 * Nunca ejecuta TRUNCATE, ni DELETE sin filtro, ni DROP.
 * Revalida la base real antes de cualquier escritura.
 */
async function cleanupTestData(
    options = {}
) {

    const userIds =
        normalizeIdList(
            options.userIds
        );

    const serverIds =
        normalizeIdList(
            options.serverIds
        );

    const agentIds =
        normalizeIdList(
            options.agentIds
        );

    if (
        userIds.length === 0
        && serverIds.length === 0
        && agentIds.length === 0
    ) {
        return;
    }

    const pool =
        getTestPool();

    await assertConnectedToTestDatabase(
        pool
    );

    const client =
        await pool.connect();

    try {

        await client.query(
            "BEGIN"
        );

        /**
         * AGENT_TOKEN_REFRESHED se identifica por agentId
         * y no lleva serverId en sus detalles, asi que la
         * limpieza por servidor no lo alcanzaria. Se borra
         * acotado a los agentId de la prueba, nunca por
         * event_type en global.
         */
        if (
            agentIds.length > 0
        ) {

            await client.query(
                `
                DELETE FROM audit_logs
                WHERE event_type = $1
                AND details->>'agentId' = ANY($2::text[])
                `,
                [
                    AGENT_TOKEN_REFRESHED_EVENT,
                    agentIds.map(
                        value =>
                            String(value)
                    )
                ]
            );

        }

        if (
            serverIds.length > 0
        ) {

            await client.query(
                `
                DELETE FROM audit_logs
                WHERE event_type = ANY($1::text[])
                AND details->>'serverId' = ANY($2::text[])
                `,
                [
                    REGISTRATION_KEY_EVENTS,
                    serverIds.map(
                        value =>
                            String(value)
                    )
                ]
            );

            await client.query(
                `
                DELETE FROM agents
                WHERE server_id = ANY($1::int[])
                `,
                [serverIds]
            );

            await client.query(
                `
                DELETE FROM registration_keys
                WHERE server_id = ANY($1::int[])
                OR user_id = ANY($2::int[])
                `,
                [
                    serverIds,
                    userIds
                ]
            );

            await client.query(
                `
                DELETE FROM servers
                WHERE id = ANY($1::int[])
                `,
                [serverIds]
            );

        }

        if (
            userIds.length > 0
        ) {

            await client.query(
                `
                DELETE FROM registration_keys
                WHERE user_id = ANY($1::int[])
                `,
                [userIds]
            );

            await client.query(
                `
                DELETE FROM servers
                WHERE user_id = ANY($1::int[])
                `,
                [userIds]
            );

            await client.query(
                `
                DELETE FROM users
                WHERE id = ANY($1::int[])
                `,
                [userIds]
            );

        }

        await client.query(
            "COMMIT"
        );

    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {

        client.release();

    }

}

async function closeTestPool() {

    if (
        resolvedPool === null
    ) {
        return;
    }

    const pool =
        resolvedPool;

    resolvedPool =
        null;

    await pool.end();

}

module.exports = {
    SAFE_ERROR_MESSAGE,
    getSafeConfigurationSummary,
    getExpectedDatabaseName,
    getTestPool,
    verifyTestConnection,
    createTestUser,
    createTestServer,
    createTestAgent,
    cleanupTestData,
    closeTestPool
};
