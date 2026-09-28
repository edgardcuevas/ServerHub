const pool = require("../config/db");

/**
 * Horas que debe tener una sesion caducada para que la
 * limpieza la considere borrable.
 *
 * El margen no es arbitrario. Una sesion administrativa
 * dura 15 minutos y se renueva hasta un maximo absoluto de
 * 2 horas, asi que a las 24 horas ninguna sesion viva puede
 * seguir siendo Renovable ni util. El margen da tiempo de
 * sobra para inspectar un fallo antes de que el dato
 * desaparezca, y evita que una sesion que acaba de caducar
 * se borre en la misma pasada en que se diagnosing.
 */
const RETENTION_HOURS =
    24;

/**
 * Elimina las sesiones administrativas caducadas hace mas
 * de RETENTION_HOURS.
 *
 * La politica se resuelve entera dentro de PostgreSQL, con
 * CURRENT_TIMESTAMP y make_interval. No se calcula ninguna
 * fecha en JavaScript y no se usa Date.now(), porque el
 * instante que decide el borrado tiene que ser el mismo que
 * usa la columna expires_at al ser evaluada. Calcularlo fuera
 * introduciria el desfase de zona horaria de node-postgres:
 * la columna es timestamp without time zone y el proceso
 * puede ir seis horas por delante o por detras.
 *
 * El umbral se pasa como parametro ligado, no interpolado,
 * de modo que el DELETE es una consulta parametrizada y el
 * valor de retencion queda en un unico sitio.
 *
 * El comparador es estricto: expires_at < umbral. Una sesion
 * cuya caducidad cae exactamente en el umbral se conserva y
 * se borrara en la siguiente pasada. Es intencionado, evita
 * que un DELETE_y_REINSERT simultaneos con la lectura del
 * umbral se pisen por un extremo.
 *
 * Es una sola sentencia, asi que no lleva transaccion: o
 * se cumple entera o no se cumple. Un DELETE sin WHERE esta
 * justificado porque el WHERE es la politica, y la politica
 * es lo unico que decide que se borra.
 *
 * No se escribe nada en audit_logs. Un borrado de
 * mantenimiento no es un evento de sesion: si se
 * auditara, cada pasada del cron generaria filas que no
 * describen ninguna accion de un usuario. La trazabilidad
 * de cuando existio cada sesion queda en los eventos
 * ADMIN_SESSION_CREATED, que el servicio de limpieza no
 * toca.
 *
 * Devuelve unicamente la cantidad de filas eliminadas. No
 * devuelve tokens, ni filas, ni identificadores, de modo
 * que quien la invoque no pueda registrar un secreto por
 * accidente al loguear el resultado.
 *
 * NOTA DE ALCANCE: esta funcion no esta conectada a ningun
 * cron todavia. Se invoca de forma explicita.
 */
async function cleanupExpiredAdminSessions() {

    const result =
        await pool.query(
            `
            DELETE FROM admin_sessions
            WHERE expires_at <
                CURRENT_TIMESTAMP
                    - make_interval(
                        hours => $1
                    )
            RETURNING id
            `,
            [RETENTION_HOURS]
        );

    return {
        deletedCount: result.rowCount
    };

}

module.exports = {
    cleanupExpiredAdminSessions,
    RETENTION_HOURS
};
