const crypto = require("crypto");
const pool = require("../config/db");

const {
    createAuditLog
} = require("./audit.service");

const {
    createAlert,
    resolveAlert
} = require("./alert.service");

/**
 * Codigo SQLSTATE de violacion de unicidad.
 */
const UNIQUE_VIOLATION_CODE =
    "23505";

/**
 * Nombres reales de las restricciones unicas de agents,
 * obtenidos de pg_indexes en la base.
 */
const AGENT_SERVER_UNIQUE =
    "agents_server_id_key";

const AGENT_TOKEN_UNIQUE =
    "agents_agent_token_key";

const AGENT_ALREADY_LINKED_ERROR =
    "Este servidor ya tiene un agente vinculado";

const AGENT_CREDENTIALS_CONFLICT_ERROR =
    "Conflicto al generar las credenciales del agente";

const AGENT_REGISTRATION_CONFLICT_ERROR =
    "Conflicto al registrar el agente";

async function registerAgent(data) {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const {
            registrationKey,
            version,
            hostname,
            operatingSystem,
            architecture
        } = data;

        const keyResult = await client.query(
            `
            SELECT *
            FROM registration_keys
            WHERE registration_key = $1
            FOR UPDATE
            `,
            [registrationKey]
        );

        const key = keyResult.rows[0];

        if (!key) {
            throw new Error("Clave inválida");
        }

        if (key.is_used) {
            throw new Error("Clave ya utilizada");
        }

        if (
            new Date(key.expires_at) <
            new Date()
        ) {
            throw new Error("Clave expirada");
        }

        const serverId = key.server_id;

        if (!serverId) {
            throw new Error(
                "La clave no está asociada a un servidor"
            );
        }

        const agentToken =
            "agt_" +
            crypto.randomBytes(16).toString("hex");

        const agentSecret =
            crypto.randomBytes(32).toString("hex");

        const tokenExpiresAt =
            new Date(
                Date.now() +
                90 * 24 * 60 * 60 * 1000
            );

        const agentResult = await client.query(
            `
            INSERT INTO agents
            (
                server_id,
                agent_token,
                agent_secret,
                token_expires_at,
                version,
                hostname,
                operating_system,
                architecture
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            `,
            [
                serverId,
                agentToken,
                agentSecret,
                tokenExpiresAt,
                version || "1.0.0",
                hostname,
                operatingSystem,
                architecture
            ]
        );

        const keyUpdateResult =
            await client.query(
                `
                UPDATE registration_keys
                SET is_used = true
                WHERE id = $1
                AND is_used = false
                `,
                [
                    key.id
                ]
            );

        if (
            keyUpdateResult.rowCount !== 1
        ) {
            throw new Error(
                "Clave ya utilizada"
            );
        }

        await createAuditLog(
            "REGISTRATION_KEY_USED",
            {
                registrationKeyId:
                    key.id,

                serverId,

                agentId:
                    agentResult.rows[0].id
            },
            client
        );

        await createAuditLog(
            "AGENT_REGISTERED",
            {
                agentId:
                    agentResult.rows[0].id,

                serverId,

                hostname,

                operatingSystem,

                architecture,

                version:
                    version || "1.0.0"
            },
            client
        );

        await client.query("COMMIT");

        return {
            agentId: agentResult.rows[0].id,
            agentToken,
            agentSecret
        };

    } catch (error) {

        await client.query("ROLLBACK");

        throw normalizeRegistrationError(error);

    } finally {

        client.release();

    }
}

/**
 * Traduce los errores de PostgreSQL que pueden escaping de
 * registerAgent por colisiones de indices unicos.
 *
 * El controlador responde con error.message, asi que el
 * mensaje crudo de PostgreSQL llegaria al cliente HTTP con
 * nombres de restricciones, detalles del motor y texto
 * tecnico. El 23505 de agents.server_id es real: se
 * reproduce de forma determinista cuando un servidor ya
 * tiene agente y se vuelve a intentar el registro.
 *
 * La traduccion es deliberadamente conservadora. Cada
 * restriccion conocida tiene su propio mensaje, y cualquier
 * 23505 no reconocido recibe un texto generico. Nunca se
 * devuelve el mensaje original de PostgreSQL.
 *
 * Los errores que no son 23505 se propagan intactos, de
 * modo que el ROLLBACK y el comportamiento del resto del
 * flujo no cambian.
 */
function normalizeRegistrationError(error) {

    if (
        !error ||
        error.code !== UNIQUE_VIOLATION_CODE
    ) {

        return error;

    }

    if (
        error.constraint
        === AGENT_SERVER_UNIQUE
    ) {

        return new Error(
            AGENT_ALREADY_LINKED_ERROR
        );

    }

    if (
        error.constraint
        === AGENT_TOKEN_UNIQUE
    ) {

        return new Error(
            AGENT_CREDENTIALS_CONFLICT_ERROR
        );

    }

    return new Error(
        AGENT_REGISTRATION_CONFLICT_ERROR
    );

}

async function heartbeat(agentToken) {

    const result = await pool.query(
        `
        UPDATE agents
        SET last_seen = CURRENT_TIMESTAMP
        WHERE agent_token = $1
        RETURNING *
        `,
        [agentToken]
    );

    const agent = result.rows[0];

    if (!agent) {
        throw new Error("Agent token inválido");
    }

    return agent;
}

async function saveStats(agentId, data) {

    const {
        cpu,
        ram,
        disk
    } = data;

    if (
        typeof cpu !== "number" ||
        typeof ram !== "number" ||
        typeof disk !== "number" ||
        Number.isNaN(cpu) ||
        Number.isNaN(ram) ||
        Number.isNaN(disk)
    ) {
        throw new Error(
            "CPU, RAM y Disco deben ser numéricos"
        );
    }

    if (
        cpu < 0 || cpu > 100 ||
        ram < 0 || ram > 100 ||
        disk < 0 || disk > 100
    ) {
        throw new Error(
            "CPU, RAM y Disco deben estar entre 0 y 100"
        );
    }

    const agentResult = await pool.query(
        `
        SELECT server_id
        FROM agents
        WHERE id = $1
        `,
        [agentId]
    );

    const agent = agentResult.rows[0];

    if (!agent) {
        throw new Error(
            "Agente no encontrado"
        );
    }

    const serverId =
        agent.server_id;

    const result = await pool.query(
        `
        INSERT INTO server_metrics
        (
            agent_id,
            cpu_usage,
            ram_usage,
            disk_usage
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [
            agentId,
            cpu,
            ram,
            disk
        ]
    );

    if (cpu > 90) {

        await createAlert(
            serverId,
            "CPU_HIGH",
            `CPU al ${cpu}%`
        );

    } else {

        await resolveAlert(
            serverId,
            "CPU_HIGH"
        );

    }

    if (ram > 90) {

        await createAlert(
            serverId,
            "RAM_HIGH",
            `RAM al ${ram}%`
        );

    } else {

        await resolveAlert(
            serverId,
            "RAM_HIGH"
        );

    }

    if (disk > 90) {

        await createAlert(
            serverId,
            "DISK_HIGH",
            `Disco al ${disk}%`
        );

    } else {

        await resolveAlert(
            serverId,
            "DISK_HIGH"
        );

    }

    return result.rows[0];
}

async function saveSystemInfo(
    agentId,
    data
) {

    const {
        hostname,
        operatingSystem,
        architecture,
        version
    } = data;

    const result = await pool.query(
        `
        UPDATE agents
        SET
            hostname = $1,
            operating_system = $2,
            architecture = $3,
            version = $4
        WHERE id = $5
        RETURNING *
        `,
        [
            hostname,
            operatingSystem,
            architecture,
            version,
            agentId
        ]
    );

    const agent = result.rows[0];

    if (!agent) {

        throw new Error(
            "Agente no encontrado"
        );

    }

    return agent;
}

async function refreshToken(agentId) {

    const crypto = require("crypto");

    const newToken =
        "agt_" +
        crypto.randomBytes(16).toString("hex");

    const newSecret =
        crypto.randomBytes(32).toString("hex");

    const tokenExpiresAt =
        new Date(
            Date.now() +
            90 * 24 * 60 * 60 * 1000
        );

    const result = await pool.query(
        `
        UPDATE agents
        SET
            agent_token = $1,
            agent_secret = $2,
            token_expires_at = $3
        WHERE id = $4
        RETURNING *
        `,
        [
            newToken,
            newSecret,
            tokenExpiresAt,
            agentId
        ]
    );
    await createAuditLog(
    "AGENT_TOKEN_REFRESHED",
    {
        agentId,
        expiresAt: tokenExpiresAt
    }
);
    return {
        agentToken: newToken,
        agentSecret: newSecret,
        expiresAt: tokenExpiresAt
    };

}

async function getTokenInfo(agentId) {

    const result = await pool.query(
        `
        SELECT
            token_expires_at
        FROM agents
        WHERE id = $1
        `,
        [agentId]
    );

    return result.rows[0];

}

module.exports = {
    registerAgent,
    heartbeat,
    saveStats,
    saveSystemInfo,
    refreshToken,
    getTokenInfo
};
