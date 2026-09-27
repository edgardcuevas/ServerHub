/**
 * CARACTERIZACION DE LA CONCURRENCIA en la politica de una
 * sola sesion administrativa activa por usuario y servidor.
 *
 * La politica se aplica de forma secuencial: DELETE de las
 * sesiones de la combinacion seguido de INSERT de la nueva,
 * dentro de una misma transaccion y sobre un mismo client.
 *
 * Eso NO demuestra por si solo que la politica se mantenga
 * bajo concurrencia. Dos transacciones simultaneas pueden
 * intercalar el DELETE y el INSERT de forma que ambas
 * acaben insertando, porque admin_sessions solo tiene
 * UNIQUE(token) y nada impide dos filas para la misma
 * combinacion (user_id, server_id).
 *
 * Esta prueba mide el comportamiento real en lugar de
 * suponerlo. Si alguna repeticion deja mas de una sesion, la
 * prueba falla, porque ese es el hallazgo.
 *
 * No imprime ningun token: solo cantidades.
 */

const {
    test,
    before,
    beforeEach,
    afterEach,
    after
} = require("node:test");

const assert =
    require("node:assert/strict");

/**
 * database.helper.js debe ser el primer require: inyecta la
 * configuracion de la base de pruebas antes de que se
 * construya el Pool de ../../src/config/db, que es un
 * singleton de modulo.
 */
const {
    verifyTestConnection,
    getTestPool,
    createTestUser,
    createTestServer,
    cleanupTestData,
    closeTestPool
} = require("../helpers/database.helper");

const {
    createAdminSession,
    validateAdminSession
} = require(
    "../../src/services/admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const REPETICIONES =
    30;

/**
 * Error de negocio exacto al que debe traducirse la
 * colision.
 */
const CONFLICT_ERROR =
    "Conflicto al crear la sesión administrativa";

/**
 * Ninguno de estos marcadores puede llegar al llamador.
 */
const MARCADORES_FUGADOS = [
    "admin_sessions_user_server_key",
    "admin_sessions_token_key",
    "duplicate key",
    "violates unique constraint",
    "detail:"
];

const trackedUserIds = [];

const trackedServerIds = [];

const trackedSessionIds = [];

function trackUser(userId) {

    trackedUserIds.push(
        Number(userId)
    );

}

function trackServer(serverId) {

    trackedServerIds.push(
        Number(serverId)
    );

}

function trackSession(sessionId) {

    trackedSessionIds.push(
        Number(sessionId)
    );

}

before(async () => {

    const info =
        await verifyTestConnection();

    assert.equal(
        info.database,
        TEST_DATABASE_NAME
    );

});

beforeEach(() => {

    trackedUserIds.length = 0;
    trackedServerIds.length = 0;
    trackedSessionIds.length = 0;

});

afterEach(async () => {

    await cleanupTestData({
        userIds:
            [
                ...trackedUserIds
            ],
        serverIds:
            [
                ...trackedServerIds
            ],
        sessionIds:
            [
                ...trackedSessionIds
            ]
    });

});

after(async () => {

    await closeTestPool();

});

async function countSessionsOf(
    userId,
    serverId
) {

    const pool =
        getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM admin_sessions
            WHERE user_id = $1
            AND server_id = $2
            `,
            [userId, serverId]
        );

    return result.rows[0].total;

}

test(
    "la creación atómica sustituye a la anterior de forma secuencial",
    async () => {

        const user =
            await createTestUser();

        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });

        trackServer(server.id);

        const primera =
            await createAdminSession(
                user.id,
                server.id
            );

        trackSession(primera.id);

        const segunda =
            await createAdminSession(
                user.id,
                server.id
            );

        trackSession(segunda.id);

        assert.notEqual(
            primera.token,
            segunda.token
        );

        assert.equal(
            await countSessionsOf(
                user.id,
                server.id
            ),
            1,
            "secuencialmente debe quedar " +
            "una sola sesion"
        );

        assert.equal(
            await validateAdminSession(
                user.id,
                server.id,
                primera.token
            ),
            null
        );

        const vigente =
            await validateAdminSession(
                user.id,
                server.id,
                segunda.token
            );

        assert.ok(vigente);

    }
);

test(
    `dos altas simultáneas de la misma combinación: ${REPETICIONES} repeticiones`,
    async t => {

        const resumen = {
            repeticiones: REPETICIONES,
            conDosOMasSesiones: 0,
            unaSesion: 0,
            conCeroSesiones: 0,
            mensajesRechazo: new Set(),
            markersFiltrados: [],
            fulfilledMinimo: null,
            fulfilledMaximo: null,
            rejectedMinimo: null,
            rejectedMaximo: null,
            tokensValidos: new Set()
        };

        for (
            let vuelta = 1;
            vuelta <= REPETICIONES;
            vuelta += 1
        ) {

            const user =
                await createTestUser();

            trackUser(user.id);

            const server =
                await createTestServer({
                    userId: user.id
                });

            trackServer(server.id);

            /**
             * Las dos llamadas se inician en el mismo
             * bloque concurrente: ninguna espera a la otra.
             */
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

            const rechazadas =
                resultados.filter(
                    item =>
                        item.status ===
                            "rejected"
                );

            /**
             * El rechazo puede llegar con dos formas
             * distintas de error de PostgreSQL y ambas se
             * traducen al mismo mensaje de negocio. El
             * servicio ya no expone el 23505, asi que aqui
             * solo se comprueba el texto publico.
             */
            const totales =
                cumplidas.length +
                rechazadas.length;

            for (
                const item of cumplidas
            ) {
                trackSession(
                    item.value.id
                );
            }

            /**
             * El rechazo debe ser el error de negocio
             * exacto, sin nombres de restriccion ni detalle
             * de PostgreSQL. No se imprime ningun token.
             */
            for (
                const item of rechazadas
            ) {

                resumen.mensajesRechazo.add(
                    item.reason.message
                );

                for (
                    const marker of
                    MARCADORES_FUGADOS
                ) {

                    if (
                        String(
                            item.reason.message
                        ).toLowerCase()
                            .includes(marker)
                    ) {

                        resumen.markersFiltrados.push(
                            marker
                        );

                    }

                }

            }

            const sesiones =
                await countSessionsOf(
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

            resumen.tokensValidos.add(
                validos
            );

            assert.equal(
                totales,
                2,
                "las dos llamadas deben resolverse"
            );

            assert.ok(
                cumplidas.length >= 1,
                "al menos una debe cumplirse"
            );

            if (
                sesiones >= 2
            ) {

                resumen.conDosOMasSesiones += 1;

                t.diagnostic(
                    `vuelta ${vuelta}: ` +
                    `cumplidas=${cumplidas.length} ` +
                    `rechazadas=${rechazadas.length} ` +
                    `sesiones=${sesiones} ` +
                    `tokens_validos=${validos}`
                );

            } else if (
                sesiones === 1
            ) {

                resumen.unaSesion += 1;

            } else {

                resumen.conCeroSesiones += 1;

                t.diagnostic(
                    `vuelta ${vuelta}: ` +
                    "la sesion desaparecio"
                );

            }

            const cumplidasCount =
                cumplidas.length;

            const rechazadasCount =
                rechazadas.length;

            resumen.fulfilledMinimo =
                resumen.fulfilledMinimo ===
                    null
                    ? cumplidasCount
                    : Math.min(
                        resumen.fulfilledMinimo,
                        cumplidasCount
                    );

            resumen.fulfilledMaximo =
                resumen.fulfilledMaximo ===
                    null
                    ? cumplidasCount
                    : Math.max(
                        resumen.fulfilledMaximo,
                        cumplidasCount
                    );

            resumen.rejectedMinimo =
                resumen.rejectedMinimo ===
                    null
                    ? rechazadasCount
                    : Math.min(
                        resumen.rejectedMinimo,
                        rechazadasCount
                    );

            resumen.rejectedMaximo =
                resumen.rejectedMaximo ===
                    null
                    ? rechazadasCount
                    : Math.max(
                        resumen.rejectedMaximo,
                        rechazadasCount
                    );

            /**
             * Limpieza por iteracion, para que una
             * repeticion no condicione la siguiente.
             */
            await cleanupTestData({
                sessionIds:
                    cumplidas.map(
                        item =>
                            item.value.id
                    ),
                serverIds:
                    [server.id],
                userIds:
                    [user.id]
            });

            trackedUserIds.length = 0;
            trackedServerIds.length = 0;
            trackedSessionIds.length = 0;

        }

        t.diagnostic(
            `RESUMEN repeticiones=${resumen.repeticiones} ` +
            `una_sesion=${resumen.unaSesion} ` +
            `dos_o_mas=${resumen.conDosOMasSesiones} ` +
            `con_cero=${resumen.conCeroSesiones} ` +
            `cumplidas=${resumen.fulfilledMinimo}` +
            `-${resumen.fulfilledMaximo} ` +
            `rechazadas=${resumen.rejectedMinimo}` +
            `-${resumen.rejectedMaximo} ` +
            `tokens_validos=[${[...resumen.tokensValidos].sort().join(",")}] ` +
            `mensajes=[${[...resumen.mensajesRechazo].join(" | ")}]`
        );

        assert.deepEqual(
            [...resumen.mensajesRechazo],
            [CONFLICT_ERROR],
            "el rechazo debe ser siempre el " +
            "mismo error de negocio"
        );

        assert.deepEqual(
            resumen.markersFiltrados,
            [],
            "ningun marcador interno puede " +
            "aparecer en el mensaje"
        );

        /**
         * SECUENCIAL: siempre exactamente una.
         */
        assert.equal(
            resumen.conCeroSesiones,
            0,
            "nunca debe desaparecer la sesion"
        );

        /**
         * POLITICA FINAL.
         *
         * Con la restriccion UNIQUE (user_id, server_id) la
         * segunda alta concurrente falla en su INSERT, el
         * ROLLBACK devuelve el estado anterior y queda una
         * sola sesion. El 23505 se traduce a un error de
         * negocio antes de salir del servicio, de modo que
         * ni el nombre de la restriccion ni el detalle de
         * PostgreSQL llegan al llamador.
         *
         * Antes de la migracion esta prueba fallaba en 24 de
         * 25 repeticiones, con dos sesiones y dos tokens
         * validos. Ese estado ya no es aceptable.
         */
        assert.equal(
            resumen.conDosOMasSesiones,
            0,
            "nunca deben quedar dos sesiones para " +
            "la misma combinacion"
        );

        assert.equal(
            resumen.unaSesion,
            REPETICIONES,
            "debe quedar exactamente una sesion en " +
            "cada repeticion"
        );

        /**
         * Cuantas llamadas se cumplen depende de como
         * PostgreSQL intercale los bloqueos, y ambos
         * resultados son correctos:
         *
         * - Si la segunda transaccion choca con la
         *   restriccion UNIQUE, se rechaza con el error de
         *   negocio y queda una sesion.
         * - Si su DELETE se serializa despues del COMMIT
         *   de la primera, elimina la fila recien creada y
         *   su propio INSERT tiene exito. Se cumple, y
         *   tambien queda una sesion, la suya.
         *
         * Lo que no puede ocurrir es que queden dos
         * sesiones, y eso es lo que se exige mas abajo.
         */
        assert.equal(
            resumen.rejectedMaximo,
            1,
            "como maximo una llamada debe fallar"
        );

        assert.ok(
            resumen.fulfilledMinimo >= 1,
            "al menos una llamada debe cumplirse"
        );

        assert.deepEqual(
            [...resumen.tokensValidos].sort(),
            [1],
            "solo un token debe validar en cada " +
            "repeticion"
        );

    }
);
