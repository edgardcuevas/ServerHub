const crypto = require("crypto");

const pool = require("../config/db");

const {
    createAuditLog
} = require(
    "./audit.service"
);

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
 * AUDITORIA
 *
 * El alta y su evento ADMIN_SESSION_CREATED se escriben en la
 * MISMA transaccion y sobre el MISMO client, y el evento se
 * emite antes del COMMIT. Si la auditoria falla, el ROLLBACK
 * revierte tanto el INSERT como el DELETE: ni la sesion nueva
 * persiste, ni se pierden las anteriores.
 *
 * replacedSessions recoge el rowCount del DELETE, de modo que
 * el evento dice si la sesion nueva sustituyo a otra o si fue
 * la primera. No se guarda ningun identificador de las
 * sesiones anteriores.
 *
 * El evento se correlaciona por adminSessionId, userId,
 * serverId y las dos fechas de expiracion. NO se registra el
 * token, ni un fragmento suyo, ni su huella, ni la contrasena
 * administrativa, ni ningun cuerpo de peticion.
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

        /**
         * El resultado del DELETE se conserva para poder
         * informar de cuantas sesiones se sustituyen. Solo se
         * lee rowCount: no se conserva ninguna fila previa.
         */
        const deleteResult =
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

        const replacedSessions =
            deleteResult.rowCount;

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

        /**
         * absolute_expires_at lo calcula PostgreSQL con la
         * misma base de reloj que created_at, en lugar de
         * sumarle 2 horas en JavaScript: asi el limite
         * absoluto de la auditoria coincide con el que
         * aplica refreshAdminSession, sin depender de la zona
         * horaria de Node ni del redondeo de un Date.
         *
         * Se listan las columnas en vez de usar RETURNING *
         * para dejar el contrato explicito. token sigue
         * devolviendose porque createServerAdminSession lo
         * entrega al cliente en su respuesta; lo que no se
         * hace es llevarlo a la auditoria.
         */
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
                RETURNING
                    id,
                    user_id,
                    server_id,
                    token,
                    expires_at,
                    created_at,
                    created_at
                        + INTERVAL '2 hours'
                        AS absolute_expires_at
                `,
                [
                    userId,
                    serverId,
                    token,
                    expiresAt
                ]
            );

        const session =
            result.rows[0];

        await createAuditLog(
            "ADMIN_SESSION_CREATED",
            {
                adminSessionId:
                    session.id,
                userId,
                serverId,
                expiresAt:
                    session.expires_at,
                absoluteExpiresAt:
                    session.absolute_expires_at,
                replacedSessions
            },
            client
        );

        await client.query(
            "COMMIT"
        );

        return session;

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
 * AUDITORIA
 *
 * Antes era una sola sentencia con pool.query() y sin
 * transaccion. Ahora usa un client propio con BEGIN, porque
 * la renovacion y su evento ADMIN_SESSION_REFRESHED tienen
 * que ser atomicos: si la auditoria falla, el ROLLBACK
 * devuelve expires_at a su valor anterior y la sesion sigue
 * vigente con la expiracion que tenia.
 *
 * El evento solo se emite si el UPDATE renovo algo. Un token
 * inexistente, de otro usuario o de otro servidor, una sesion
 * expirada o una cuyo limite absoluto ya vencio devuelven
 * null, hacen ROLLBACK y NO dejan rastro: un intento
 * fallido no es un evento de sesion.
 *
 * Se conservan sin cambio todas las condiciones del UPDATE,
 * el limite absoluto de 2 horas, el token intacto y el
 * contrato result.rows[0] || null.
 */
async function refreshAdminSession(
    userId,
    serverId,
    token
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
                UPDATE admin_sessions
                SET expires_at = LEAST(
                    CURRENT_TIMESTAMP
                        + INTERVAL '15 minutes',
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
                    created_at
                        + INTERVAL '2 hours'
                        AS absolute_expires_at
                `,
                [
                    userId,
                    serverId,
                    token
                ]
            );

        const session =
            result.rows[0] || null;

        /**
         * Sin fila renovada no hay evento. Se hace ROLLBACK
         * porque la transaccion no ha modificado nada, y asi
         * se cierra sin dejar ninguna sentencia abierta.
         */
        if (!session) {

            await client.query(
                "ROLLBACK"
            );

            return null;

        }

        await createAuditLog(
            "ADMIN_SESSION_REFRESHED",
            {
                adminSessionId:
                    session.id,
                userId,
                serverId,
                expiresAt:
                    session.expires_at,
                absoluteExpiresAt:
                    session.absolute_expires_at
            },
            client
        );

        await client.query(
            "COMMIT"
        );

        return session;

    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {

        client.release();

    }

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
 * AUDITORIA
 *
 * El DELETE va en transaccion con su evento
 * ADMIN_SESSION_CLOSED, sobre el mismo client y antes del
 * COMMIT. Si la auditoria falla, el ROLLBACK restituye la
 * fila: la sesion sigue existiendo y sigue siendo valida.
 *
 * Para auditar el cierre sin guardar el token, el RETURNING
 * pide solo informacion segura de la fila eliminada: id,
 * user_id, server_id, expires_at y created_at. El token no
 * se pide, no se copia a ninguna variable y no llega a la
 * auditoria, ni completo ni enmascarado.
 *
 * Sin fila eliminada no hay evento: un token inexistente, de
 * otro usuario o de otro servidor devuelve false, hace
 * ROLLBACK y no deja rastro, para no permitir enumerar
 * sesiones ajenas por la existencia de un evento.
 *
 * Se mantiene el contrato booleano: true si se cerro y
 * false si no habia coincidencia.
 */
async function deleteAdminSession(
    userId,
    serverId,
    token
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
                DELETE
                FROM admin_sessions
                WHERE user_id = $1
                AND server_id = $2
                AND token = $3
                RETURNING
                    id,
                    user_id,
                    server_id,
                    expires_at,
                    created_at
                `,
                [
                    userId,
                    serverId,
                    token
                ]
            );

        const deletedSession =
            result.rows[0] || null;

        if (!deletedSession) {

            await client.query(
                "ROLLBACK"
            );

            return false;

        }

        await createAuditLog(
            "ADMIN_SESSION_CLOSED",
            {
                adminSessionId:
                    deletedSession.id,
                userId,
                serverId,
                expiresAt:
                    deletedSession.expires_at
            },
            client
        );

        await client.query(
            "COMMIT"
        );

        return true;

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
    createAdminSession,
    validateAdminSession,
    refreshAdminSession,
    deleteAdminSession
};