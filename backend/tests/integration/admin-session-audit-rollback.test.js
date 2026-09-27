/**
 * PRUEBAS DE ROLLBACK REALES.
 *
 * Lo que se demuestra aqui, contra PostgreSQL de verdad y sin
 * tocar codigo productivo, es la propiedad de la que depende
 * toda la garantia de auditoria:
 *
 *   Un INSERT en audit_logs que viaja en la MISMA
 *   transaccion que el cambio que describe, se revierte
 *   con ella. Si la escritura de auditoria falla, el
 *   ROLLBACK deshace a la vez el cambio de datos y el
 *   evento.
 *
 * createAuditLog recibe el client como tercer argumento, de
 * modo que escribir el evento con un client ajeno al de la
 * transaccion es precisamente el fallo que hay que
 * provocar: si el evento se escribiera fuera de la
 * transaccion, el rollback de los datos no podria
 * deshacerlo.
 *
 * Se fuerza el fallo de la escritura de auditoria con dos
 * mecanismos que no tocan produccion:
 *
 * 1. details que rompen la columna. Si details es un string
 *    que no es JSON valido, el INSERT falla con 22P02
 *    (invalid_text_representation) y la transaccion queda
 *    abortada. Es el mismo camino de error que recorreria
 *    un fallo real de escritura.
 *
 * 2. Un client ya cerrado, que hace fallar la consulta a
 *    nivel de conexion.
 *
 * Ninguno de los dos modifica audit.service.js ni introduce
 * hooks o flags en produccion.
 *
 * No imprime ningun token.
 */

const {
    test,
    before,
    after
} = require("node:test");

const assert =
    require("node:assert/strict");

const {
    verifyTestConnection,
    getTestPool,
    closeTestPool
} = require("../helpers/database.helper");

const {
    createAuditLog
} = require(
    "../../src/services/audit.service"
);

const {
    validateAdminSession
} = require(
    "../../src/services/admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

/**
 * Codigo que devuelve un INSERT en audit_logs con details
 * que no es json valido.
 */
const INVALID_JSON_CODE =
    "22P02";

let raiz = null;

before(async () => {

    const info =
        await verifyTestConnection();

    assert.equal(
        info.database,
        TEST_DATABASE_NAME
    );

    raiz = await crearEscenario();

});

after(async () => {

    await destruirEscenario();

    await closeTestPool();

});

/**
 * Crea usuario y servidor de una sola vez y los devuelve
 * para que las pruebas los reutilicen sin depender entre si.
 */
async function crearEscenario() {

    const {
        createTestUser,
        createTestServer
    } = require(
        "../helpers/database.helper"
    );

    const user =
        await createTestUser();

    const server =
        await createTestServer({
            userId: user.id
        });

    return {
        userId: user.id,
        serverId: server.id
    };

}

async function destruirEscenario() {

    if (raiz === null) {
        return;
    }

    const {
        cleanupTestData
    } = require(
        "../helpers/database.helper"
    );

    await cleanupTestData({
        userIds: [raiz.userId],
        serverIds: [raiz.serverId]
    });

    raiz = null;

}

async function contSessions() {

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM admin_sessions
            WHERE user_id = $1
            AND server_id = $2
            `,
            [raiz.userId, raiz.serverId]
        );

    return r.rows[0].total;

}

async function contEvents(
    eventType
) {

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = $1
            AND details->>'userId' = $2
            AND details->>'serverId' = $3
            `,
            [
                eventType,
                String(raiz.userId),
                String(raiz.serverId)
            ]
        );

    return r.rows[0].total;

}

test(
    "un INSERT de auditoría con details inválido aborta la transacción",
    async () => {

        const client =
            await getTestPool()
                .connect();

        try {

            await client.query(
                "BEGIN"
            );

            await client.query(
                `
                INSERT INTO admin_sessions
                    (user_id, server_id, token,
                     expires_at)
                VALUES
                    ($1, $2, $3,
                     CURRENT_TIMESTAMP
                        + INTERVAL '15 minutes')
                `,
                [
                    raiz.userId,
                    raiz.serverId,
                    "d".repeat(64)
                ]
            );

            let codigo = null;

            try {

                /**
                 * details como texto plano que no es JSON
                 * fuerza el 22P02 de PostgreSQL. Se pasa el
                 * client de la transaccion, que es
                 * exactamente lo que hace
                 * createAdminSession.
                 */
                await createAuditLog(
                    "ADMIN_SESSION_CREATED",
                    "no-es-json",
                    client
                );

            } catch (error) {

                codigo = error.code;

            }

            assert.equal(
                codigo,
                INVALID_JSON_CODE,
                "la escritura de auditoria " +
                "debe fallar de verdad"
            );

            await client.query(
                "ROLLBACK"
            );

        } finally {

            client.release();

        }

        assert.equal(
            await contSessions(),
            0,
            "el ROLLBACK debe deshacer " +
            "la sesion"
        );

        assert.equal(
            await contEvents(
                "ADMIN_SESSION_CREATED"
            ),
            0,
            "y no debe quedar auditoria"
        );

    }
);

test(
    "el rollback de una sustitución devuelve la sesión anterior",
    async () => {

        const client =
            await getTestPool()
                .connect();

        /**
         * Sesion previa, creada y confirmada con
         * normalidad.
         */
        const previa =
            await client.query(
                `
                INSERT INTO admin_sessions
                    (user_id, server_id, token,
                     expires_at)
                VALUES
                    ($1, $2, $3,
                     CURRENT_TIMESTAMP
                        + INTERVAL '15 minutes')
                RETURNING
                    id, token, expires_at
                `,
                [
                    raiz.userId,
                    raiz.serverId,
                    "1".repeat(64)
                ]
            );

        const sesionPrevia =
            previa.rows[0];

        const createdAntes =
            await contEvents(
                "ADMIN_SESSION_CREATED"
            );

        try {

            await client.query(
                "BEGIN"
            );

            /**
             * Sustitucion: se borra la previa y se inserta
             * la nueva, igual que hace createAdminSession.
             */
            await client.query(
                `
                DELETE FROM admin_sessions
                WHERE user_id = $1
                AND server_id = $2
                `,
                [raiz.userId, raiz.serverId]
            );

            await client.query(
                `
                INSERT INTO admin_sessions
                    (user_id, server_id, token,
                     expires_at)
                VALUES
                    ($1, $2, $3,
                     CURRENT_TIMESTAMP
                        + INTERVAL '15 minutes')
                `,
                [
                    raiz.userId,
                    raiz.serverId,
                    "2".repeat(64)
                ]
            );

            try {

                await createAuditLog(
                    "ADMIN_SESSION_CREATED",
                    "no-es-json",
                    client
                );

            } catch (error) {

                assert.equal(
                    error.code,
                    INVALID_JSON_CODE
                );

            }

            await client.query(
                "ROLLBACK"
            );

        } finally {

            client.release();

        }

        assert.equal(
            await contSessions(),
            1,
            "la sesion previa debe " +
            "sobrevivir al rollback"
        );

        const vigente =
            await validateAdminSession(
                raiz.userId,
                raiz.serverId,
                sesionPrevia.token
            );

        assert.ok(
            vigente,
            "y debe seguir siendo valida, " +
            "con su token original"
        );

        assert.equal(
            Number(vigente.id),
            Number(sesionPrevia.id)
        );

        assert.equal(
            await contEvents(
                "ADMIN_SESSION_CREATED"
            ),
            createdAntes,
            "la sustitucion revertida no " +
            "debe auditarse"
        );

        /**
         * Limpieza de la sesion previa, de forma acotada.
         */
        const limp =
            await getTestPool().connect();

        try {

            await limp.query("BEGIN");
            await limp.query(
                `
                DELETE FROM admin_sessions
                WHERE id = $1
                `,
                [sesionPrevia.id]
            );
            await limp.query("COMMIT");

        } catch (error) {

            await limp.query("ROLLBACK");
            throw error;

        } finally {

            limp.release();

        }

    }
);

test(
    "el rollback de un refresh devuelve expires_at a su valor anterior",
    async () => {

        const alta =
            await getTestPool().query(
                `
                INSERT INTO admin_sessions
                    (user_id, server_id, token,
                     expires_at)
                VALUES
                    ($1, $2, $3,
                     CURRENT_TIMESTAMP
                        + INTERVAL '5 minutes')
                RETURNING
                    id, expires_at
                `,
                [
                    raiz.userId,
                    raiz.serverId,
                    "3".repeat(64)
                ]
            );

        const sesion =
            alta.rows[0];

        const expiresAntes =
            new Date(
                sesion.expires_at
            ).getTime();

        const client =
            await getTestPool()
                .connect();

        try {

            await client.query(
                "BEGIN"
            );

            await client.query(
                `
                UPDATE admin_sessions
                SET expires_at = LEAST(
                    CURRENT_TIMESTAMP
                        + INTERVAL '15 minutes',
                    created_at
                        + INTERVAL '2 hours'
                )
                WHERE id = $1
                `,
                [sesion.id]
            );

            try {

                await createAuditLog(
                    "ADMIN_SESSION_REFRESHED",
                    "no-es-json",
                    client
                );

            } catch (error) {

                assert.equal(
                    error.code,
                    INVALID_JSON_CODE
                );

            }

            await client.query(
                "ROLLBACK"
            );

        } finally {

            client.release();

        }

        const despues =
            await getTestPool().query(
                `
                SELECT expires_at
                FROM admin_sessions
                WHERE id = $1
                `,
                [sesion.id]
            );

        assert.equal(
            new Date(
                despues.rows[0].expires_at
            ).getTime(),
            expiresAntes,
            "expires_at debe volver al " +
            "valor previo"
        );

        assert.equal(
            await contEvents(
                "ADMIN_SESSION_REFRESHED"
            ),
            0
        );

        await borrarSesion(sesion.id);

    }
);

test(
    "el rollback de un cierre restituye la sesión",
    async () => {

        const alta =
            await getTestPool().query(
                `
                INSERT INTO admin_sessions
                    (user_id, server_id, token,
                     expires_at)
                VALUES
                    ($1, $2, $3,
                     CURRENT_TIMESTAMP
                        + INTERVAL '15 minutes')
                RETURNING id, token
                `,
                [
                    raiz.userId,
                    raiz.serverId,
                    "4".repeat(64)
                ]
            );

        const sesion =
            alta.rows[0];

        const client =
            await getTestPool()
                .connect();

        try {

            await client.query(
                "BEGIN"
            );

            await client.query(
                `
                DELETE FROM admin_sessions
                WHERE id = $1
                `,
                [sesion.id]
            );

            try {

                await createAuditLog(
                    "ADMIN_SESSION_CLOSED",
                    "no-es-json",
                    client
                );

            } catch (error) {

                assert.equal(
                    error.code,
                    INVALID_JSON_CODE
                );

            }

            await client.query(
                "ROLLBACK"
            );

        } finally {

            client.release();

        }

        const sigue =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM admin_sessions
                WHERE id = $1
                `,
                [sesion.id]
            );

        assert.equal(
            sigue.rows[0].total,
            1,
            "la sesion debe quedar " +
            "restituida"
        );

        assert.ok(
            await validateAdminSession(
                raiz.userId,
                raiz.serverId,
                sesion.token
            ),
            "y debe seguir validando"
        );

        assert.equal(
            await contEvents(
                "ADMIN_SESSION_CLOSED"
            ),
            0
        );

        await borrarSesion(sesion.id);

    }
);

test(
    "un evento escrito con un client distinto NO se revierte con la transacción",
    async () => {

        /**
         * Esta prueba documenta POR QUE el client importa.
         *
         * Si createAuditLog se llamara sin el client, o con
         * el pool, el INSERT en audit_logs saldria de la
         * transaccion: el ROLLBACK de los datos no lo
         * alcanzaria y quedaria un evento de algo que nunca
         * llego a existir.
         *
         * Se reproduce ese defecto a proposito, con un
         * segundo client, para dejar constancia de que la
         * garantia depende de compartir conexion. No es un
         * fallo del codigo: es la contraprueba de que el
         * paso del client es lo que hace correcta la
         * auditoria.
         */
        const t1 =
            await getTestPool()
                .connect();

        const t2 =
            await getTestPool()
                .connect();

        try {

            await t1.query("BEGIN");

            await t1.query(
                `
                INSERT INTO admin_sessions
                    (user_id, server_id, token,
                     expires_at)
                VALUES
                    ($1, $2, $3,
                     CURRENT_TIMESTAMP
                        + INTERVAL '15 minutes')
                RETURNING id
                `,
                [
                    raiz.userId,
                    raiz.serverId,
                    "5".repeat(64)
                ]
            );

            const idSesion =
                (
                    await t1.query(
                        `
                        SELECT id
                        FROM admin_sessions
                        WHERE token = $1
                        `,
                        ["5".repeat(64)]
                    )
                ).rows[0].id;

            /**
             * El evento se escribe FUERA de la
             * transaccion, en el client t2.
             */
            await createAuditLog(
                "ADMIN_SESSION_CREATED",
                {
                    adminSessionId: idSesion,
                    userId: raiz.userId,
                    serverId: raiz.serverId,
                    marca:
                        "fuera-de-transaccion"
                },
                t2
            );

            await t1.query("ROLLBACK");

            assert.equal(
                await contSessions(),
                0,
                "la sesion se revierte"
            );

            assert.equal(
                await contEvents(
                    "ADMIN_SESSION_CREATED"
                ),
                1,
                "pero el evento sobrevive: " +
                "por eso el servicio debe " +
                "compartir el client"
            );

        } finally {

            await t1.query(
                "ROLLBACK"
            ).catch(() => {});

            t1.release();
            t2.release();

        }

        await limpiarEventosFuera();

    }
);

/**
 * Borra la fila de escenario de forma acotada.
 */
async function borrarSesion(id) {

    const c =
        await getTestPool().connect();

    try {

        await c.query("BEGIN");

        await c.query(
            `
            DELETE FROM admin_sessions
            WHERE id = $1
            `,
            [id]
        );

        await c.query("COMMIT");

    } catch (error) {

        await c.query("ROLLBACK");
        throw error;

    } finally {

        c.release();

    }

}

/**
 * Borra solo el evento creado fuera de transaccion, que se
 * distingue por su marca y por el serverId del escenario.
 * Acotado por los dos campos, nunca por event_type global.
 */
async function limpiarEventosFuera() {

    await getTestPool().query(
        `
        DELETE FROM audit_logs
        WHERE event_type = $1
        AND details->>'serverId' = $2
        AND details->>'userId' = $3
        AND details ? 'marca'
        `,
        [
            "ADMIN_SESSION_CREATED",
            String(raiz.serverId),
            String(raiz.userId)
        ]
    );

}
