const crypto = require("crypto");

const pool = require("../config/db");

/**
 * Codigo SQLSTATE de violacion de unicidad.
 */
const UNIQUE_VIOLATION_CODE =
    "23505";

/**
 * Restricciones de unicidad reales de admin_sessions.
 */
const USER_SERVER_UNIQUE =
    "admin_sessions_user_server_key";

const TOKEN_UNIQUE =
    "admin_sessions_token_key";

/**
 * Mensajes seguros para una colision. No incluyen el nombre
 * de la restriccion ni el detalle de PostgreSQL, porque
 * createServerAdminSession responde con error.message y ese
 * texto acabaria en la respuesta HTTP.
 */
const SESSION_CONFLICT_ERROR =
    "Conflicto al crear la sesión administrativa";

const TOKEN_CONFLICT_ERROR =
    "Conflicto al generar la sesión administrativa";

/**
 * Abre una sesion administrativa aplicando la politica de una
 * sola sesion activa por usuario y servidor.
 *
 * Al desbloquear de nuevo la misma combinacion, las sesiones
 * anteriores de ESA combinacion se eliminan y la nueva las
 * sustituye. El token anterior deja de validar porque su fila
 * ya no existe, no porque se marque como revocada: por eso
 * no hace falta ninguna columna nueva.
 *
 * El borrado y el alta van en una sola transaccion sobre un
 * unico client, de modo que nunca queda una combinacion sin
 * sesion por un fallo intermedio, ni dos sesiones por un
 * fallo del alta. Cualquier error provoca ROLLBACK, que
 * devuelve las sesiones anteriores a su estado previo.
 *
 * El DELETE filtra por user_id y server_id, de modo que no
 * toca las sesiones del mismo usuario en otros servidores, ni
 * las de otros usuarios, ni nada global.
 *
 * No se registra nada en auditoria y en particular no se
 * registra ningun token.
 */
async function createAdminSession(
    userId,
    serverId
) {

    const client =
        await pool.connect();

    try {

        await client.query(
            "BEGIN"
        );

        await client.query(
            `
            DELETE
            FROM admin_sessions
            WHERE user_id = $1
            AND server_id = $2
            `,
            [
                userId,
                serverId
            ]
        );

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
            await client.query(
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

        await client.query(
            "COMMIT"
        );

        return result.rows[0];

    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        throw normalizeSessionCreationError(error);

    } finally {

        client.release();

    }

}

/**
 * Traduce una colision de unicidad al error de negocio
 * equivalente.
 *
 * Sin la restriccion UNIQUE (user_id, server_id), dos altas
 * concurrentes de la misma combinacion podian terminar con dos
 * filas y ambos tokens valiendo. Con la restriccion, la
 * segunda falla en su INSERT y el ROLLBACK devuelve el estado
 * anterior, de modo que la politica deja de depender del
 * orden de las sentencias.
 *
 * Esa colision es real, asi que el 23505 no puede dejarse
 * pasar: createServerAdminSession responde con error.message
 * y un texto crudo de PostgreSQL llegaria al cliente con el
 * nombre de la restriccion y el detalle del motor.
 *
 * La traduccion es conservadora. Solo se interpreta el 23505,
 * y dentro de el solo las dos restricciones conocidas. Cualquier
 * otro error se propaga intacto, igual que antes.
 */
function normalizeSessionCreationError(error) {

    if (
        !error ||
        error.code !== UNIQUE_VIOLATION_CODE
    ) {

        return error;

    }

    if (
        error.constraint ===
        USER_SERVER_UNIQUE
    ) {

        return new Error(
            SESSION_CONFLICT_ERROR
        );

    }

    if (
        error.constraint ===
        TOKEN_UNIQUE
    ) {

        return new Error(
            TOKEN_CONFLICT_ERROR
        );

    }

    return new Error(
        SESSION_CONFLICT_ERROR
    );

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