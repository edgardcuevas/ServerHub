const crypto = require("crypto");

const pool = require("../config/db");

async function createAdminSession(
    userId,
    serverId
) {

    const token =
        crypto.randomBytes(32)
            .toString("hex");

    const expiresAt =
        new Date(
            Date.now() +
            (
                15 * 60 * 1000
            )
        );

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
            VALUES
            (
                $1,
                $2,
                $3,
                $4
            )
            RETURNING *
            `,
            [
                userId,
                serverId,
                token,
                expiresAt
            ]
        );

    return result.rows[0];

}

async function validateAdminSession(
    userId,
    serverId,
    token
) {

    const result =
        await pool.query(
            `
            SELECT *
            FROM admin_sessions
            WHERE user_id = $1
            AND server_id = $2
            AND token = $3
            AND expires_at > CURRENT_TIMESTAMP
            `,
            [
                userId,
                serverId,
                token
            ]
        );

    return result.rows[0] || null;

}

/**
 * Renueva una sesion administrativa vigente.
 *
 * La renovacion extiende 15 minutos desde ahora, pero nunca
 * mas alla de las 2 horas contadas desde created_at, de modo
 * que el trabajo continuo no expulsa al usuario y a la vez no
 * permite sesiones administrativas infinitas.
 *
 * El limite se resuelve con LEAST dentro de PostgreSQL, en
 * lugar de calcularlo en JavaScript, para que la comparacion
 * use exactamente la misma base de reloj que usa la columna
 * expires_at y que no dependa de la zona horaria de Node.
 *
 * created_at y token no se tocan, y no se crea ninguna fila
 * nueva: es la misma sesion con otra expiracion. Por eso el
 * token no rota y el cliente no necesita replaces nada.
 *
 * Defensa en profundidad: el UPDATE repite las mismas
 * condiciones que valida requireAdminSession, de modo que la
 * escritura queda protegida aunque el middleware cambie o no
 * se use. En particular, una sesion expirada no se revive,
 * y una sesion cuyo limite absoluto ya vencio tampoco, aun
 * cuando su expires_at siga en el futuro.
 *
 * Es una sola sentencia, asi que no lleva transaccion. No
 * registra nada en auditoria y en particular no registra el
 * token.
 */
async function refreshAdminSession(
    userId,
    serverId,
    token
) {

    const result =
        await pool.query(
            `
            UPDATE admin_sessions
            SET expires_at = LEAST(
                CURRENT_TIMESTAMP + INTERVAL '15 minutes',
                created_at + INTERVAL '2 hours'
            )
            WHERE user_id = $1
            AND server_id = $2
            AND token = $3
            AND expires_at > CURRENT_TIMESTAMP
            AND created_at + INTERVAL '2 hours'
                > CURRENT_TIMESTAMP
            RETURNING
                id,
                user_id,
                server_id,
                expires_at,
                created_at,
                created_at + INTERVAL '2 hours'
                    AS absolute_expires_at
            `,
            [
                userId,
                serverId,
                token
            ]
        );

    return result.rows[0] || null;

}

/**
 * Cierra una sesion administrativa exigiendo la propiedad.
 *
 * Antes borraba solo por token, de modo que cualquier
 * usuario autenticado que conociera el token de otro
 * podia cerrarle la sesion. Ahora la coincidencia de
 * user_id, server_id y token es requisito, y si no
 * ocurre no se borra nada.
 *
 * No se envuelve en transaccion: es una sola sentencia.
 * No se registra nada en auditoria, y en particular no se
 * registra el token.
 */
async function deleteAdminSession(
    userId,
    serverId,
    token
) {

    const result =
        await pool.query(
            `
            DELETE
            FROM admin_sessions
            WHERE user_id = $1
            AND server_id = $2
            AND token = $3
            RETURNING id
            `,
            [
                userId,
                serverId,
                token
            ]
        );

    return result.rowCount === 1;

}

module.exports = {
    createAdminSession,
    validateAdminSession,
    refreshAdminSession,
    deleteAdminSession
};