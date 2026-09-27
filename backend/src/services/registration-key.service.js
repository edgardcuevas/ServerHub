const pool = require("../config/db");
const {
    generateRegistrationKey
} = require(
    "../utils/registration-key.util"
);
const {
    createAuditLog
} = require("./audit.service");



async function createKey(userId, serverId) {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const serverResult =
    await client.query(
        `
        SELECT id
        FROM servers
        WHERE id = $1
        AND user_id = $2
        `,
        [
            serverId,
            userId
        ]
    );

if (
    serverResult.rows.length === 0
) {
    throw new Error(
        "Servidor no encontrado"
    );
}

        const agentResult = await client.query(
            `
            SELECT id
            FROM agents
            WHERE server_id = $1
            `,
            [serverId]
        );

        if (agentResult.rows.length > 0) {
            throw new Error(
                "Este servidor ya tiene un agente vinculado"
            );
        }

        await client.query(
            `
            UPDATE registration_keys
            SET is_used = true
            WHERE server_id = $1
            AND is_used = false
            `,
            [serverId]
        );

        const registrationKey = generateRegistrationKey();


        const expiresAt = new Date();

        expiresAt.setDate(
            expiresAt.getDate() + 1
        );

        const result = await client.query(
            `
            INSERT INTO registration_keys
            (
                user_id,
                server_id,
                registration_key,
                expires_at
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                userId,
                serverId,
                registrationKey,
                expiresAt
            ]
        );

        await createAuditLog(
            "REGISTRATION_KEY_CREATED",
            {
                registrationKeyId:
                    result.rows[0].id,
                serverId,
                expiresAt
            },
            client
        );

        await client.query("COMMIT");

        return result.rows[0];

    } catch (error) {

        await client.query("ROLLBACK");

        throw error;

    } finally {

        client.release();

    }
}

async function getKeys(userId) {

    const result = await pool.query(
        `
        SELECT *
        FROM registration_keys
        WHERE user_id = $1
        ORDER BY id DESC
        `,
        [userId]
    );

    return result.rows;
}

module.exports = {
    createKey,
    getKeys
};