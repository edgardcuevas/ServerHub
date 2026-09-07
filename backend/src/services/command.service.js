const pool = require("../config/db");

async function createCommand(
    agentId,
    commandType,
    payload = {}
) {

    const result =
        await pool.query(
            `
            INSERT INTO agent_commands
            (
                agent_id,
                command_type,
                payload
            )
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                agentId,
                commandType,
                payload
            ]
        );

    return result.rows[0];
}

async function getPendingCommand(
    agentId
) {

    const client =
        await pool.connect();

    try {

        await client.query(
            "BEGIN"
        );

        const result =
            await client.query(
                `
                SELECT *
                FROM agent_commands
                WHERE agent_id = $1
                AND status = 'PENDING'
                ORDER BY id ASC
                LIMIT 1
                FOR UPDATE
                `,
                [agentId]
            );

        const command =
            result.rows[0];

        if (!command) {

            await client.query(
                "COMMIT"
            );

            return null;

        }

        await client.query(
            `
            UPDATE agent_commands
            SET status = 'IN_PROGRESS'
            WHERE id = $1
            `,
            [command.id]
        );

        command.status =
            "IN_PROGRESS";

        await client.query(
            "COMMIT"
        );

        return command;

    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {

        client.release();

    }

}

async function completeCommand(
    commandId,
    resultData,
    status = "COMPLETED"
) {

    const result =
        await pool.query(
            `
            UPDATE agent_commands
            SET
                status = $3,
                result = $2,
                executed_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
            `,
            [
                commandId,
                resultData,
                status
            ]
        );

    return result.rows[0];

}

async function getPendingCommands(
    agentId,
    limit = 5
) {

    const client =
        await pool.connect();

    try {

        await client.query(
            "BEGIN"
        );

        const result =
            await client.query(
                `
                SELECT *
                FROM agent_commands
                WHERE agent_id = $1
                AND status = 'PENDING'
                ORDER BY id ASC
                LIMIT $2
                FOR UPDATE
                `,
                [
                    agentId,
                    limit
                ]
            );

        const commands =
            result.rows;

        if (
            commands.length === 0
        ) {

            await client.query(
                "COMMIT"
            );

            return [];

        }

        await client.query(
            `
            UPDATE agent_commands
            SET status = 'IN_PROGRESS'
            WHERE id = ANY($1)
            `,
            [
                commands.map(
                    c => c.id
                )
            ]
        );

        commands.forEach(
            command => {
                command.status =
                    "IN_PROGRESS";
            }
        );

        await client.query(
            "COMMIT"
        );

        return commands;

    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {

        client.release();

    }

}

module.exports = {
    createCommand,
    getPendingCommand,
    completeCommand,
    getPendingCommands
};