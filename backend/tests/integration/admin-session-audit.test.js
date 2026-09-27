/**
 * AUDITORIA SEGURA DE SESIONES ADMINISTRATIVAS.
 *
 * admin-session.service emite tres eventos:
 * ADMIN_SESSION_CREATED, ADMIN_SESSION_REFRESHED y
 * ADMIN_SESSION_CLOSED. Esta prueba comprueba que se emiten
 * exactamente cuando deben, con los campos permitidos, y
 * que jamas contienen un secreto.
 *
 * Los tres eventos comparten una propiedad: se escriben en la
 * MISMA transaccion que el cambio que describen, sobre el
 * mismo client, antes del COMMIT. De ahi se deduce que una
 * transaccion revertida no deja auditoria, porque su INSERT
 * en audit_logs se revierte con ella. Esa es la garantia que
 * sostiene el caso 10 y el test de concurrencia.
 *
 * No imprime ningun token: solo cantidades, nombres de
 * evento y nombres de propiedad.
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
    closeTestPool,
    ADMIN_SESSION_EVENTS,
    FORBIDDEN_AUDIT_KEYS
} = require("../helpers/database.helper");

const {
    createAdminSession,
    validateAdminSession,
    refreshAdminSession,
    deleteAdminSession
} = require(
    "../../src/services/admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const EVENT_CREATED =
    "ADMIN_SESSION_CREATED";

const EVENT_REFRESHED =
    "ADMIN_SESSION_REFRESHED";

const EVENT_CLOSED =
    "ADMIN_SESSION_CLOSED";

/**
 * Campos que cada evento puede contener. La comprobacion es
 * de subconjunto:details puede tener mas, pero nunca campos
 * fuera de esta lista.
 */
const ALLOWED_KEYS = {
    [EVENT_CREATED]: [
        "adminSessionId",
        "userId",
        "serverId",
        "expiresAt",
        "absoluteExpiresAt",
        "replacedSessions"
    ],
    [EVENT_REFRESHED]: [
        "adminSessionId",
        "userId",
        "serverId",
        "expiresAt",
        "absoluteExpiresAt"
    ],
    [EVENT_CLOSED]: [
        "adminSessionId",
        "userId",
        "serverId",
        "expiresAt"
    ]
};

/**
 * Contrasena representativa. Se usa SOLO como texto de
 * busqueda negativa: el servicio nunca la recibe, porque
 * createAdminSession no tiene contrasena como parametro. Se
 * comprueba que ni siquiera esa cadena aparece.
 */
const CONTRASENA_FICTICIA =
    "clave-admin-que-no-debe-aparecer-nunca";

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
    if (
        sessionId !== undefined &&
        sessionId !== null
    ) {
        trackedSessionIds.push(
            Number(sessionId)
        );
    }
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
        userIds: [...trackedUserIds],
        serverIds: [...trackedServerIds],
        sessionIds: [...trackedSessionIds]
    });

});

after(async () => {

    await closeTestPool();

});

/**
 * Eventos de sesion de una combinacion, en orden.
 * Acotado por userId y serverId, nunca global.
 */
async function eventsOf(
    userId,
    serverId
) {

    const pool = getTestPool();

    const result =
        await pool.query(
            `
            SELECT
                event_type,
                details,
                id
            FROM audit_logs
            WHERE event_type = ANY($1::text[])
            AND details->>'userId' = $2
            AND details->>'serverId' = $3
            ORDER BY id
            `,
            [
                ADMIN_SESSION_EVENTS,
                String(userId),
                String(serverId)
            ]
        );

    return result.rows;

}

async function countEvents(
    userId,
    serverId,
    eventType
) {

    const pool = getTestPool();

    const result =
        await pool.query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = $1
            AND details->>'userId' = $2
            AND details->>'serverId' = $3
            `,
            [
                eventType,
                String(userId),
                String(serverId)
            ]
        );

    return result.rows[0].total;

}

async function countSessions(
    userId,
    serverId
) {

    const pool = getTestPool();

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

/**
 * details es jsonb y node-postgres lo devuelve ya parseado,
 * de modo que un entero escrito en el evento llega como
 * number y no como string. Estas comparaciones pasan siempre
 * por Number para no depender de como se representa.
 */
function num(value) {
    return Number(value);
}

/**
 * CASO 1: creacion inicial.
 */
test(
    "la creación inicial emite un ADMIN_SESSION_CREATED con replacedSessions = 0",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        assert.ok(session.id);
        assert.equal(
            await countSessions(
                user.id,
                server.id
            ),
            1
        );

        const eventos =
            await eventsOf(
                user.id,
                server.id
            );

        assert.equal(
            eventos.length,
            1,
            "debe haber exactamente un evento"
        );

        assert.equal(
            eventos[0].event_type,
            EVENT_CREATED
        );

        const det = eventos[0].details;

        assert.equal(
            num(det.adminSessionId),
            num(session.id)
        );
        assert.equal(
            num(det.userId),
            num(user.id)
        );
        assert.equal(
            num(det.serverId),
            num(server.id)
        );
        assert.ok(
            det.expiresAt,
            "expiresAt debe estar presente"
        );
        assert.ok(
            det.absoluteExpiresAt,
            "absoluteExpiresAt debe estar presente"
        );
        assert.equal(
            det.replacedSessions,
            0,
            "una creacion inicial no " +
            "sustituye ninguna sesion"
        );

        /**
         * El limite absoluto que registra la auditoria debe
         * ser exactamente 2 horas despues de created_at, que
         * es el mismo criterio que aplica el refresh.
         */
        const fila =
            await getTestPool().query(
                `
                SELECT
                    created_at
                FROM admin_sessions
                WHERE id = $1
                `,
                [session.id]
            );

        const dif =
            new Date(
                det.absoluteExpiresAt
            ).getTime() -
            new Date(
                fila.rows[0].created_at
            ).getTime();

        assert.equal(
            dif,
            7200000,
            "absoluteExpiresAt debe ser " +
            "created_at + 2 horas"
        );

    }
);

/**
 * CASO 2: sustitucion.
 */
test(
    "el segundo desbloqueo sustituye a la sesión anterior y lo registra con replacedSessions = 1",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const sesionA =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(sesionA.id);

        const sesionB =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(sesionB.id);

        assert.notEqual(
            sesionA.token,
            sesionB.token
        );

        const eventos =
            await eventsOf(
                user.id,
                server.id
            );

        assert.equal(
            eventos.length,
            2,
            "deben existir dos eventos CREATED"
        );

        assert.equal(
            eventos[0].details
                .replacedSessions,
            0
        );

        assert.equal(
            eventos[1].details
                .replacedSessions,
            1,
            "el segundo debe declarar que " +
            "sustituyo a una sesion"
        );

        assert.equal(
            num(
                eventos[1].details
                    .adminSessionId
            ),
            num(sesionB.id)
        );

        assert.equal(
            await countSessions(
                user.id,
                server.id
            ),
            1,
            "solo debe quedar la sesion B"
        );

        assert.equal(
            await validateAdminSession(
                user.id,
                server.id,
                sesionA.token
            ),
            null,
            "el token A no debe validar"
        );

        assert.ok(
            await validateAdminSession(
                user.id,
                server.id,
                sesionB.token
            ),
            "el token B debe validar"
        );

    }
);

/**
 * CASO 3: refresh valido.
 */
test(
    "el refresh válido emite un ADMIN_SESSION_REFRESHED con la nueva expiración",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        const renovada =
            await refreshAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.ok(renovada);

        assert.equal(
            await countEvents(
                user.id,
                server.id,
                EVENT_REFRESHED
            ),
            1
        );

        const eventos =
            await eventsOf(
                user.id,
                server.id
            );

        const det = eventos.find(
            item =>
                item.event_type ===
                EVENT_REFRESHED
        ).details;

        assert.equal(
            num(det.adminSessionId),
            num(session.id)
        );
        assert.equal(
            num(det.userId),
            num(user.id)
        );
        assert.equal(
            num(det.serverId),
            num(server.id)
        );
        assert.ok(det.expiresAt);
        assert.ok(det.absoluteExpiresAt);

        /**
         * La expiracion auditada debe coincidir con la que
         * devolvio el servicio y con la que quedo en la fila.
         */
        const fila =
            await getTestPool().query(
                `
                SELECT expires_at
                FROM admin_sessions
                WHERE id = $1
                `,
                [session.id]
            );

        assert.equal(
            new Date(
                det.expiresAt
            ).getTime(),
            new Date(
                fila.rows[0].expires_at
            ).getTime()
        );

        assert.equal(
            new Date(
                det.expiresAt
            ).getTime(),
            new Date(
                renovada.expires_at
            ).getTime()
        );

    }
);

/**
 * CASO 4: refresh con token incorrecto.
 */
test(
    "el refresh con token incorrecto devuelve null y no emite evento",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        const resultado =
            await refreshAdminSession(
                user.id,
                server.id,
                "f".repeat(64)
            );

        assert.equal(resultado, null);

        assert.equal(
            await countEvents(
                user.id,
                server.id,
                EVENT_REFRESHED
            ),
            0,
            "un token invalido no es un evento"
        );

    }
);

/**
 * CASO 5: refresh de sesion expirada.
 */
test(
    "el refresh de una sesión expirada devuelve null y no emite evento",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        /**
         * Se envejece la fila 10 minutos en el pasado usando
         * CURRENT_TIMESTAMP, que es exactamente la misma base
         * de reloj con la que el servicio evalua
         * expires_at > CURRENT_TIMESTAMP. Envejecer con un
         * epoch convertido a UTC correria el riesgo de
         * desplazar la fila seis horas por la zona horaria.
         */
        await getTestPool().query(
            `
            UPDATE admin_sessions
            SET expires_at =
                CURRENT_TIMESTAMP
                    - INTERVAL '10 minutes'
            WHERE id = $1
            `,
            [session.id]
        );

        const resultado =
            await refreshAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(resultado, null);

        assert.equal(
            await countEvents(
                user.id,
                server.id,
                EVENT_REFRESHED
            ),
            0,
            "una sesion expirada no se renueva " +
            "ni se audita"
        );

    }
);

/**
 * CASO 6: logout valido.
 */
test(
    "el logout válido emite un ADMIN_SESSION_CLOSED y elimina la sesión",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        const cerrado =
            await deleteAdminSession(
                user.id,
                server.id,
                session.token
            );

        assert.equal(cerrado, true);

        assert.equal(
            await countEvents(
                user.id,
                server.id,
                EVENT_CLOSED
            ),
            1
        );

        const eventos =
            await eventsOf(
                user.id,
                server.id
            );

        const det = eventos.find(
            item =>
                item.event_type ===
                EVENT_CLOSED
        ).details;

        assert.equal(
            num(det.adminSessionId),
            num(session.id)
        );
        assert.equal(
            num(det.userId),
            num(user.id)
        );
        assert.equal(
            num(det.serverId),
            num(server.id)
        );
        assert.ok(det.expiresAt);

        assert.equal(
            await countSessions(
                user.id,
                server.id
            ),
            0,
            "la sesion debe estar eliminada"
        );

    }
);

/**
 * CASO 7: logout con token inexistente.
 */
test(
    "el logout con token inexistente devuelve false y no emite evento",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        const cerrado =
            await deleteAdminSession(
                user.id,
                server.id,
                "e".repeat(64)
            );

        assert.equal(cerrado, false);

        assert.equal(
            await countEvents(
                user.id,
                server.id,
                EVENT_CLOSED
            ),
            0
        );

        assert.equal(
            await countSessions(
                user.id,
                server.id
            ),
            1,
            "la sesion real sigue viva"
        );

    }
);

/**
 * CASO 8: logout con usuario ajeno.
 */
test(
    "el logout con usuario ajeno devuelve false, no emite evento y conserva la sesión",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        const intruso =
            await createTestUser();
        trackUser(intruso.id);

        const cerrado =
            await deleteAdminSession(
                intruso.id,
                server.id,
                session.token
            );

        assert.equal(cerrado, false);

        assert.equal(
            await countEvents(
                user.id,
                server.id,
                EVENT_CLOSED
            ),
            0
        );

        assert.equal(
            await countSessions(
                user.id,
                server.id
            ),
            1,
            "la sesion del propietario " +
            "debe permanecer"
        );

        assert.ok(
            await validateAdminSession(
                user.id,
                server.id,
                session.token
            ),
            "y debe seguir siendo valida"
        );

    }
);

/**
 * CASO 9: logout con servidor incorrecto.
 */
test(
    "el logout con servidor incorrecto devuelve false, no emite evento y conserva la sesión",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const session =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(session.id);

        const otroServidor =
            await createTestServer({
                userId: user.id
            });
        trackServer(otroServidor.id);

        const cerrado =
            await deleteAdminSession(
                user.id,
                otroServidor.id,
                session.token
            );

        assert.equal(cerrado, false);

        assert.equal(
            await countEvents(
                user.id,
                server.id,
                EVENT_CLOSED
            ),
            0
        );

        assert.equal(
            await countSessions(
                user.id,
                server.id
            ),
            1,
            "la sesion del servidor real " +
            "debe permanecer"
        );

    }
);

/**
 * CASO 10: busqueda negativa de secretos.
 *
 * Recorre el ciclo completo con un token conocido y una
 * contrasena ficticia, y despues busca, con SQL
 * parametrizado, si alguno de los dos aparece en details.
 *
 * No se imprime el valor buscado ni el contenido de details:
 * solo la cantidad de coincidencias, que debe ser 0.
 */
test(
    "ningún evento contiene el token, la contraseña ni propiedades prohibidas",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        const sesionA =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(sesionA.id);

        const tokenUsado = sesionA.token;

        await refreshAdminSession(
            user.id,
            server.id,
            tokenUsado
        );

        const sesionB =
            await createAdminSession(
                user.id,
                server.id
            );
        trackSession(sesionB.id);

        await refreshAdminSession(
            user.id,
            server.id,
            sesionB.token
        );

        const cerrado =
            await deleteAdminSession(
                user.id,
                server.id,
                sesionB.token
            );

        assert.equal(cerrado, true);

        const eventos =
            await eventsOf(
                user.id,
                server.id
            );

        assert.equal(
            eventos.length,
            5,
            "2 CREATED + 2 REFRESHED + 1 CLOSED"
        );

        /**
         * 1. El texto del token no puede aparecer en
         * ningun details, ni completo ni como subcadena.
         *    details::text es el predicado mas amplio
         *    posible: si el token estuviera anidado en
         *    cualquier nivel, apareceria aqui.
         */
        const porToken =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM audit_logs
                WHERE event_type = ANY($1::text[])
                AND details::text LIKE $2
                `,
                [
                    ADMIN_SESSION_EVENTS,
                    "%" + tokenUsado + "%"
                ]
            );

        assert.equal(
            porToken.rows[0].total,
            0,
            "el token no puede aparecer en " +
            "ningun evento"
        );

        /**
         * 2. Tampoco sus 16 primeiros caracteres, que es
         * como se enmascararia un token.
         */
        const porPrefijo =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM audit_logs
                WHERE event_type = ANY($1::text[])
                AND details::text LIKE $2
                `,
                [
                    ADMIN_SESSION_EVENTS,
                    "%" +
                        tokenUsado.slice(0, 16) +
                        "%"
                ]
            );

        assert.equal(
            porPrefijo.rows[0].total,
            0,
            "un prefijo del token no puede " +
            "aparecer"
        );

        /**
         * 3. Ni los 16 ultimos, que es el sufijo.
         */
        const porSufijo =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM audit_logs
                WHERE event_type = ANY($1::text[])
                AND details::text LIKE $2
                `,
                [
                    ADMIN_SESSION_EVENTS,
                    "%" +
                        tokenUsado.slice(-16) +
                        "%"
                ]
            );

        assert.equal(
            porSufijo.rows[0].total,
            0,
            "un sufijo del token no puede " +
            "aparecer"
        );

        /**
         * 4. La contrasena tampoco.
         */
        const porContrasena =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM audit_logs
                WHERE event_type = ANY($1::text[])
                AND details::text LIKE $2
                `,
                [
                    ADMIN_SESSION_EVENTS,
                    "%" +
                        CONTRASENA_FICTICIA +
                        "%"
                ]
            );

        assert.equal(
            porContrasena.rows[0].total,
            0,
            "la contrasena no puede aparecer"
        );

        /**
         * 5. Ninguna propiedad prohibida existe, ni en la
         * raiz de details ni anidada. Se usa el operador ?
         * de jsonb, que es exacto y no depende de buscar
         * subcadenas en un texto.
         */
        for (
            const clave of FORBIDDEN_AUDIT_KEYS
        ) {

            const conClave =
                await getTestPool().query(
                    `
                    SELECT count(*)::int AS total
                    FROM audit_logs
                    WHERE event_type = ANY($1::text[])
                    AND details ? $2
                    `,
                    [
                        ADMIN_SESSION_EVENTS,
                        clave
                    ]
                );

            assert.equal(
                conClave.rows[0].total,
                0,
                "la propiedad '" + clave +
                "' no debe existir"
            );

        }

        /**
         * 6. Y cada details contiene unicamente campos del
         * conjunto permitido para su evento.
         */
        for (
            const item of eventos
        ) {

            const permitidas =
                ALLOWED_KEYS[
                    item.event_type
                ];

            for (
                const clave of Object.keys(
                    item.details
                )
            ) {

                assert.ok(
                    permitidas.includes(clave),
                    "propiedad no permitida " +
                    "'" + clave + "' en " +
                    item.event_type
                );

            }

        }

    }
);

/**
 * ATOMICIDAD.
 *
 * Una transaccion revertida no puede dejar auditoria, porque
 * el INSERT en audit_logs viaja en la misma transaccion que
 * el cambio que describe. Este test lo comprueba de forma
 * indirecta pero concluyente: provoke el conflicto de
 * unicidad que hace fallar la segunda alta concurrente, y
 * verifica que la transaccion perdedora no dejo ni sesion ni
 * evento, mientras la ganadora si dejo ambos.
 */
test(
    "una transacción revertida no deja ni sesión ni auditoría",
    async () => {

        const user = await createTestUser();
        trackUser(user.id);

        const server =
            await createTestServer({
                userId: user.id
            });
        trackServer(server.id);

        /**
         * Se fuerza el conflicto de la restriccion
         * UNIQUE (user_id, server_id) desde una conexion
         * propia: dos inserts simultaneos sobre la misma
         * combinacion, uno de los cuales debe chocar.
         *
         * Se hace sobre el servicio real, no sobre SQL
         * suelto, para que la transaccion incompleta sea la
         * de createAdminSession.
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

        for (
            const item of cumplidas
        ) {
            trackSession(item.value.id);
        }

        assert.equal(
            await countSessions(
                user.id,
                server.id
            ),
            1,
            "solo puede quedar una sesion"
        );

        /**
         * El numero de eventos CREATED debe coincidir
         * exactamente con el de transacciones que se
         * confirmaron. Una transaccion que hizo ROLLBACK no
         * puede haber dejado su evento.
         */
        const creados =
            await countEvents(
                user.id,
                server.id,
                EVENT_CREATED
            );

        assert.equal(
            creados,
            cumplidas.length,
            "los eventos CREATED deben ser " +
            "exactamente los de las " +
            "transacciones confirmadas"
        );

        assert.ok(
            creados >= 1,
            "al menos una transaccion se " +
            "confirma"
        );

        const idsAuditados =
            (await eventsOf(
                user.id,
                server.id
            )).map(
                item =>
                    Number(
                        item.details
                            .adminSessionId
                    )
            );

        /**
         * El ultimo evento debe apuntar a la sesion que
         * sobrevive.
         *
         * No se exige que TODOS los eventos apunten a una
         * fila viva, y no es un defecto que some no lo haga.
         * Si la segunda transaccion se serializa despues del
         * COMMIT de la primera, su DELETE borra la sesion que
         * la primera acaba de crear: esa primera sesion
         * existio y se confirmo legitimamente, y su evento
         * tambien. Lo unico que no puede ocurrir es que una
         * transaccion revertida haya dejado evento, y eso es
         * lo que comprueba la comparacion de conteos de
         * arriba.
         */
        const idUltimo =
            idsAuditados[
                idsAuditados.length - 1
            ];

        const superviviente =
            await getTestPool().query(
                `
                SELECT id
                FROM admin_sessions
                WHERE user_id = $1
                AND server_id = $2
                `,
                [user.id, server.id]
            );

        assert.equal(
            Number(superviviente.rows[0].id),
            idUltimo,
            "el ultimo evento corresponde a la " +
            "sesion que sobrevive"
        );

    }
);
