/**
 * CONCURRENCIA DE LA AUDITORIA DE SESION.
 *
 * Comprueba la misma invariante que la prueba de
 * concurrencia de la sesion, y anade la de la auditoria:
 *
 * - Nunca queda mas de una sesion para (user_id,
 *   server_id).
 * - Nunca queda mas de un token valido.
 * - El numero de eventos ADMIN_SESSION_CREATED coincide
 *   exactamente con el de transacciones que se
 *   confirmaron.
 *
 * La tercera es la que importa aqui. Cada evento se escribe
 * en la misma transaccion que el INSERT de la sesion, asi
 * que una transaccion que hace ROLLBACK se lleva por delante
 * su evento. Si alguna vez la cuenta de eventos superase a
 * la de confirmaciones, la auditoria estaria registrando
 * sesiones que nunca existieron.
 *
 * No imprime ningun token: solo cantidades.
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
    createTestUser,
    createTestServer,
    cleanupTestData,
    closeTestPool,
    ADMIN_SESSION_EVENTS
} = require("../helpers/database.helper");

const {
    createAdminSession,
    validateAdminSession
} = require(
    "../../src/services/admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const EVENT_CREATED =
    "ADMIN_SESSION_CREATED";

/**
 * 25 repeticiones. Cada una crea usuario, servidor, lanza
 * dos altas simultaneas y limpia. Es mas que las 20 que
 * pide la politica.
 */
const REPETICIONES =
    25;

before(async () => {

    const info =
        await verifyTestConnection();

    assert.equal(
        info.database,
        TEST_DATABASE_NAME
    );

});

after(async () => {

    await closeTestPool();

});

test(
    `dos altas simultáneas: ${REPETICIONES} repeticiones con auditoría`,
    async t => {

        const resumen = {
            unaSesion: 0,
            dosOMasSesiones: 0,
            ceroSesiones: 0,
            tokensValidos: new Set(),
            eventosPorVuelta: [],
            discrepancias: [],
            superadas: 0
        };

        for (
            let vuelta = 1;
            vuelta <= REPETICIONES;
            vuelta += 1
        ) {

            const user =
                await createTestUser();

            const server =
                await createTestServer({
                    userId: user.id
                });

            const resultados =
                await Promise.allSettled(
                    [
                        createAdminSession(
                            user.id,
                            server.id
                        ),
                        createAdminSession(
                            user.id,
                            server.id
                        )
                    ]
                );

            const cumplidas =
                resultados.filter(
                    item =>
                        item.status ===
                            "fulfilled"
                );

            const sesiones =
                await contarSesiones(
                    user.id,
                    server.id
                );

            /**
             * Cuantos de los tokens devueltos siguen
             * validando. Sin imprimirlos.
             */
            let validos = 0;

            for (
                const item of cumplidas
            ) {

                const vigente =
                    await validateAdminSession(
                        user.id,
                        server.id,
                        item.value.token
                    );

                if (vigente) {
                    validos += 1;
                }

            }

            const eventos =
                await contarEventos(
                    user.id,
                    server.id,
                    EVENT_CREATED
                );

            resumen.tokensValidos.add(
                validos
            );

            resumen.eventosPorVuelta.push(
                eventos
            );

            /**
             * ESTA es la comprobacion propia de esta
             * prueba: los eventos confirmados deben ser
             * exactamente los de las transacciones que se
             * COMMITearon. Un evento de mas seria una
             * auditoria de una transaccion revertida.
             */
            if (
                eventos !==
                cumplidas.length
            ) {

                resumen.discrepancias.push(
                    "vuelta " + vuelta +
                    ": eventos=" + eventos +
                    " confirmadas=" +
                    cumplidas.length
                );

            }

            if (
                eventos >
                cumplidas.length
            ) {
                resumen.superadas += 1;
            }

            if (sesiones >= 2) {
                resumen.dosOMasSesiones += 1;
            } else if (sesiones === 1) {
                resumen.unaSesion += 1;
            } else {
                resumen.ceroSesiones += 1;
            }

            if (
                sesiones !== 1 ||
                validos !== 1
            ) {

                t.diagnostic(
                    `vuelta ${vuelta}: ` +
                    `sesiones=${sesiones} ` +
                    `tokens_validos=${validos} ` +
                    `confirmadas=${cumplidas.length} ` +
                    `eventos=${eventos}`
                );

            }

            /**
             * El ultimo evento debe apuntar a la sesion
             * que sobrevive, porque el ultimo CREATE es la
             * sesion vigente.
             */
            const ultimoEvento =
                await getTestPool().query(
                    `
                    SELECT
                        (a.details->>'adminSessionId')
                            AS sid
                    FROM audit_logs a
                    WHERE a.event_type = $1
                    AND a.details->>'userId' = $2
                    AND a.details->>'serverId' = $3
                    ORDER BY a.id DESC
                    LIMIT 1
                    `,
                    [
                        EVENT_CREATED,
                        String(user.id),
                        String(server.id)
                    ]
                );

            const idSuperviviente =
                await getTestPool().query(
                    `
                    SELECT id
                    FROM admin_sessions
                    WHERE user_id = $1
                    AND server_id = $2
                    `,
                    [user.id, server.id]
                );

            if (
                ultimoEvento.rows.length === 1 &&
                idSuperviviente.rows.length === 1
            ) {

                assert.equal(
                    Number(
                        ultimoEvento
                            .rows[0].sid
                    ),
                    Number(
                        idSuperviviente
                            .rows[0].id
                    ),
                    "el ultimo evento debe " +
                    "apuntar a la sesion vigente"
                );

            }

            await cleanupTestData({
                userIds: [user.id],
                serverIds: [server.id],
                sessionIds:
                    cumplidas.map(
                        item =>
                            item.value.id
                    )
            });

        }

        t.diagnostic(
            `RESUMEN repeticiones=${REPETICIONES} ` +
            `una_sesion=${resumen.unaSesion} ` +
            `dos_o_mas=${resumen.dosOMasSesiones} ` +
            `con_cero=${resumen.ceroSesiones} ` +
            `tokens_validos=[${[...resumen.tokensValidos].sort().join(",")}] ` +
            `eventos_por_vuelta=[${resumen.eventosPorVuelta.join(",")}]`
        );

        assert.deepEqual(
            resumen.discrepancias,
            [],
            "los eventos deben coincidir con " +
            "las transacciones confirmadas"
        );

        assert.equal(
            resumen.superadas,
            0,
            "nunca puede haber mas eventos " +
            "que transacciones confirmadas"
        );

        assert.equal(
            resumen.dosOMasSesiones,
            0,
            "nunca deben quedar dos sesiones"
        );

        assert.equal(
            resumen.ceroSesiones,
            0,
            "nunca debe desaparecer la sesion"
        );

        assert.equal(
            resumen.unaSesion,
            REPETICIONES
        );

        assert.deepEqual(
            [...resumen.tokensValidos].sort(),
            [1],
            "solo un token debe validar"
        );

    }
);

async function contarSesiones(
    userId,
    serverId
) {

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM admin_sessions
            WHERE user_id = $1
            AND server_id = $2
            `,
            [userId, serverId]
        );

    return r.rows[0].total;

}

async function contarEventos(
    userId,
    serverId,
    eventType
) {

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = ANY($1::text[])
            AND details->>'userId' = $2
            AND details->>'serverId' = $3
            `,
            [
                ADMIN_SESSION_EVENTS,
                String(userId),
                String(serverId)
            ]
        );

    return r.rows[0].total;

}
