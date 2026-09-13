const pool = require("../config/db");

async function authenticateAgentStream(
    req,
    res,
    next
) {

    try {

        const agentToken =
            req.header("X-Agent-Token");

        if (!agentToken) {

            return res.status(401).json({
                success: false,
                message:
                    "Agent token requerido"
            });

        }

        const result =
            await pool.query(
                `
                SELECT *
                FROM agents
                WHERE agent_token = $1
                `,
                [agentToken]
            );

        const agent =
            result.rows[0];

        if (!agent) {

            return res.status(401).json({
                success: false,
                message:
                    "Agent token inválido"
            });

        }

        req.agent = agent;

        next();

    } catch (error) {

        res.status(500).json({
            success: false,
            message:
                error.message
        });

    }

}

module.exports = {
    authenticateAgentStream
};