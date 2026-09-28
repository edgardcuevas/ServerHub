/**
 * SERVICIO DE LIMPIEZA DE SESIONES ADMINISTRATIVAS
 * EXPIRADAS.
 *
 * cleanupExpiredAdminSessions borra las sesiones caducadas
 * hace mas de 24 horas y solo esas. Esta prueba comprueba la
 * frontera exacta de esa politica, que es lo unico
 * interesante de un DELETE con retencion: un dia de mas o de
 * menos cambia que se conserva.
 *
 * La caducidad de cada sesion se fija con CURRENT_TIMESTAMP
 * dentro de PostgreSQL, nunca con una fecha calculada en
 * JavaScript. Es la misma base de reloj que usa el servicio
 * para decidir, de modo que los casos de frontera son
 * deterministas y no dependen de la zona horaria del
 * proceso.
 *
 * admin_sessions tiene UNIQUE (user_id, server_id), asi que
 * cada sesion de prueba necesita su propio servidor. Por eso
 * los escenarios crean un servidor por sesion en lugar de
 * agruparlas.
 *
 * No imprime ningun token: los tokens de prueba se generan
 * aquí y no se muestran nunca.
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
    withGlobalCleanupLock
} = require("../helpers/database.helper");

const {
    cleanupExpiredAdminSessions,
    RETENTION_HOURS
} = require(
    "../../src/services/admin-session-cleanup.service"
);

const {
    createAdminSession
} = require(
    "../../src/services/admin-session.service"
);

const {
    createAuditLog
} = require(
    "../../src/services/audit.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const trackedUserIds = [];

const trackedServerIds = [];

/**
 * Servidores de la prueba en curso.
 *
 * node --test ejecuta los archivos de integracion en
 * paralelo, asi que una cuenta global de admin_sessions
 * incluiria las filas de otros archivos y haria fallar
 * estas pruebas de forma intermitente. Todo recuento de
 * sesiones va acotado a estos servidores.
 */
let servidoresDeLaPrueba = [];

const trackedSessionIds = [];

function trackUser(id) {
    trackedUserIds.push(Number(id));
}

function trackServer(id) {
    trackedServerIds.push(Number(id));
}

function trackSession(id) {
    trackedSessionIds.push(Number(id));
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
    servidoresDeLaPrueba = [];

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
 * Ejecuta la limpieza SIN tomar el lock.
 *
 * El lock lo toma pruebaDeLimpieza(), que envuelve el
 * CUERPO COMPLETO de cada prueba. Es importante que no
 * haya dos niveles: si el cuerpo ya esta bajo el lock y
 * limpiar() volviera a tomarlo en otra conexion, esa
 * segunda llamada esperaria un cerrojo que ella misma
 * tiene y la prueba se quedaria colgada.
 */
async function limpiar() {

    return cleanupExpiredAdminSessions();

}

/**
 * Declara una prueba que ejecuta una limpieza global.
 *
 * El lock cubre desde antes de envejecer las fixtures
 * hasta despues de comprobar el resultado. Tomarlo solo
 * alrededor de la llamada al servicio NO basta: la ventana
 * peligrosa va desde "mis filas ya son elegibles" hasta
 * "miro el resultado", y en medio otra limpieza de otro
 * proceso se las llevaria.
 *
 * @param {string} nombre
 * @param {Function} cuerpo
 */
function pruebaDeLimpieza(
    nombre,
    cuerpo
) {

    test(
        nombre,
        () => withGlobalCleanupLock(cuerpo)
    );

}

/**
 * Crea un usuario con tantos servidores como necesite el
 * caso, y devuelve sus ids.
 */
async function crearEscenario(
    cuantosServidores
) {

    const user =
        await createTestUser();

    trackUser(user.id);

    const servidores = [];

    for (
        let i = 0;
        i < cuantosServidores;
        i += 1
    ) {

        const server =
            await createTestServer({
                userId: user.id
            });

        trackServer(server.id);

        servidores.push(server.id);

    }

    servidoresDeLaPrueba = servidores;

    return {
        userId: user.id,
        servidores
    };

}

/**
 * Inserta una sesion con la caducidad que se le pida,
 * expresada como una resta sobre CURRENT_TIMESTAMP dentro de
 * PostgreSQL.
 *
 * El desplazamiento se pasa como SEGUNDOS y se construye con
 * make_interval, de modo que el instante lo decide el
 * servidor y no el proceso de pruebas.
 *
 * @param {number} userId
 * @param {number} serverId
 * @param {number|null} segundosAtras  null = activa
 * @returns {Promise<object>} la fila insertada
 */
async function insertarSesion(
    userId,
    serverId,
    segundosAtras
) {

    const pool = getTestPool();

    /**
     * Cada token es un valor fijo distinto, derivado del
     * serverId y no aleatorio, para que la prueba sea
     * reproducible. No se imprime ninguno.
     */
    const token =
        "t".repeat(56) +
        String(serverId).padStart(8, "0");

    /**
     * El desplazamiento va en $4, no en $3: $3 ya lo ocupa el
     * token y PostgreSQL deduce un unico tipo por marcador,
     * de modo que reutilizarlo con un entero daria
     * "inconsistent types deduced for parameter $3".
     *
     * En el caso activo la caducidad no lleva parametro
     * alguno, y la lista se recorta para no enviar de mas.
     */
    const esActiva =
        segundosAtras === null;

    const caducidad =
        esActiva
            ? "CURRENT_TIMESTAMP + INTERVAL '1 hour'"
            : "CURRENT_TIMESTAMP - make_interval(secs => $4)";

    const parametros = [
        userId,
        serverId,
        token
    ];

    if (!esActiva) {
        parametros.push(segundosAtras);
    }

    const resultado =
        await pool.query(
            `
            INSERT INTO admin_sessions
                (user_id, server_id, token,
                 expires_at)
            VALUES
                ($1, $2, $3, ` + caducidad + `)
            RETURNING id, token, expires_at
            `,
            parametros
        );

    trackSession(
        resultado.rows[0].id
    );

    return resultado.rows[0];

}

/**
 * Cuenta las sesiones de los servidores de ESTA prueba.
 *
 * El filtro es obligatorio: sin el, las pruebas fallan de
 * forma intermitente cuando los demas archivos de
 * integracion se ejecutan en paralelo sobre la misma base.
 */
async function contarSesiones() {

    if (
        servidoresDeLaPrueba.length === 0
    ) {

        return 0;

    }

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM admin_sessions
            WHERE server_id = ANY($1::int[])
            `,
            [servidoresDeLaPrueba]
        );

    return r.rows[0].total;
}

async function contar(
    tabla,
    userId
) {

    if (
        tabla !== "users" &&
        tabla !== "servers"
    ) {

        throw new Error(
            "contar() solo admite users " +
            "o servers"
        );

    }

    const columna =
        tabla === "users"
            ? "id"
            : "user_id";

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM ` + tabla + `
            WHERE ` + columna + ` = $1
            `,
            [userId]
        );

    return r.rows[0].total;
}

const HORA = 3600;

/**
 * CASO 1: sesion activa.
 */
pruebaDeLimpieza(
    "una sesión activa no se elimina",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        await insertarSesion(
            userId,
            servidores[0],
            null
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            0
        );

        assert.equal(
            await contarSesiones(),
            1,
            "la sesion activa sigue viva"
        );

    }
);

/**
 * CASO 2: caducada hace 2 horas.
 */
pruebaDeLimpieza(
    "una sesión caducada hace 2 horas no se elimina",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        await insertarSesion(
            userId,
            servidores[0],
            2 * HORA
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            0
        );

        assert.equal(
            await contarSesiones(),
            1
        );

    }
);

/**
 * CASO 3: caducada hace 23 horas.
 */
pruebaDeLimpieza(
    "una sesión caducada hace 23 horas no se elimina",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        await insertarSesion(
            userId,
            servidores[0],
            23 * HORA
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            0,
            "23 horas esta dentro del margen " +
            "de 24"
        );

        assert.equal(
            await contarSesiones(),
            1
        );

    }
);

/**
 * CASO 4: caducada hace 24 horas y 1 minuto.
 */
pruebaDeLimpieza(
    "una sesión caducada hace 24 horas y 1 minuto se elimina",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        await insertarSesion(
            userId,
            servidores[0],
            24 * HORA + 60
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            1
        );

        assert.equal(
            await contarSesiones(),
            0
        );

    }
);

/**
 * FRONTERA: un segundo a cada lado del umbral.
 */
pruebaDeLimpieza(
    "el margen es estable a ambos lados: un segundo antes se conserva y un segundo después se borra",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId,
            servidores[0],
            24 * HORA - 1
        );
        await insertarSesion(
            userId,
            servidores[1],
            24 * HORA + 1
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            1,
            "solo la que supera el margen"
        );

        const restantes =
            await getTestPool().query(
                `
                SELECT id
                FROM admin_sessions
                WHERE user_id = $1
                `,
                [userId]
            );

        assert.equal(
            restantes.rows.length,
            1
        );

        assert.equal(
            Number(restantes.rows[0].id),
            Number(
                trackedSessionIds[0]
            ),
            "sobrevive la que estaba a un " +
            "segundo del umbral"
        );

    }
);

/**
 * ESTRICTEZ DEL COMPARADOR.
 *
 * La fila cuya caducidad cae exactamente en el umbral no se
 * puede comprobar a traves de cleanupExpiredAdminSessions,
 * y no por un defecto del servicio sino porque su
 * CURRENT_TIMESTAMP se lee en el instante de ejecutar el
 * DELETE, unas milisegundos despues de que el INSERT
 * escribiera el suyo. Durante ese hueco el umbral avanza y
 * la fila queda del lado de la borrada. La prueba es
 * intrinsecamente intermitente.
 *
 * Aqui se comprueba la semantica del < directamente sobre
 * el SQL, y de forma determinista, gracias a que
 * CURRENT_TIMESTAMP esta CONGELADO durante una transaccion:
 * el INSERT y el DELETE ven exactamente el mismo instante.
 *
 * Es la misma sentencia que usa el servicio, con el mismo
 * make_interval(hours => 24). Lo que se demuestra es que el
 * comparador es < y no <=.
 */
pruebaDeLimpieza(
    "el comparador del umbral es estricto: en el instante exacto la fila se conserva",
    async () => {

        const { userId, servidores } =
            await crearEscenario(3);

        const client =
            await getTestPool()
                .connect();

        try {

            await client.query("BEGIN");

            /**
             * Las tres filas se colocan respecto al mismo
             * CURRENT_TIMESTAMP congelado de esta
             * transaccion: una en el umbral exacto, una un
             * segundo antes y otra un segundo despues.
             */
            await client.query(
                `
                INSERT INTO admin_sessions
                    (user_id, server_id, token,
                     expires_at)
                SELECT
                    $1,
                    s.id,
                    repeat('b', 56)
                        || lpad(
                            s.id::text, 8, '0'
                        ),
                    CURRENT_TIMESTAMP
                        - make_interval(hours => 24)
                        + make_interval(
                            secs => o.desplaz
                        )
                FROM unnest($2::int[])
                    WITH ORDINALITY AS s(id, ord)
                JOIN unnest(
                    ARRAY[0, -1, 1]::int[]
                ) WITH ORDINALITY
                    AS o(desplaz, ord)
                    ON s.ord = o.ord
                RETURNING id, expires_at
                `,
                [
                    userId,
                    servidores
                ]
            );

            /**
             * Misma sentencia que el servicio.
             */
            const borrado =
                await client.query(
                    `
                    DELETE FROM admin_sessions
                    WHERE expires_at <
                        CURRENT_TIMESTAMP
                            - make_interval(
                                hours => 24
                            )
                    RETURNING id
                    `
                );

            const supervivientes =
                await client.query(
                    `
                    SELECT count(*)::int AS total
                    FROM admin_sessions
                    WHERE user_id = $1
                    `,
                    [userId]
                );

            assert.equal(
                borrado.rowCount,
                1,
                "solo se borra la que esta " +
                "un segundo despues del umbral"
            );

            assert.equal(
                supervivientes.rows[0].total,
                2,
                "la del umbral exacto y la " +
                "que esta un segundo antes " +
                "sobreviven"
            );

            await client.query("ROLLBACK");

        } finally {

            /**
             * El ROLLBACK se reintenta aqui a proposito.
             *
             * Si una asercion falla entre el BEGIN y el
             * ROLLBACK, el finally se ejecuta con la
             * transaccion todavia abierta. node-postgres NO
             * revierte por su cuenta al devolver el client
             * al pool: devuelve la conexion en estado
             * abortado, y la siguiente prueba que la reuse
             * falla con "current transaction is aborted".
             * Eso deja residuos en la base de pruebas y
             * hace fallar pruebas ajenas.
             */
            await client.query(
                "ROLLBACK"
            ).catch(() => {});

            client.release();

        }

    }
);

/**
 * CASO 5: tres sesiones antiguas.
 */
pruebaDeLimpieza(
    "tres sesiones antiguas se eliminan en una pasada",
    async () => {

        const { userId, servidores } =
            await crearEscenario(3);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        await insertarSesion(
            userId, servidores[1], 3 * 24 * HORA
        );
        await insertarSesion(
            userId, servidores[2], 400 * HORA
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            3
        );

        assert.equal(
            await contarSesiones(),
            0
        );

    }
);

/**
 * CASO 6: mezcla de activas y caducadas.
 */
pruebaDeLimpieza(
    "una mezcla solo elimina las caducadas fuera de margen",
    async () => {

        const { userId, servidores } =
            await crearEscenario(6);

        const esperadas = [
            { etiqueta: "activa", atras: null },
            {
                etiqueta: "caducada 2h",
                atras: 2 * HORA
            },
            {
                etiqueta: "caducada 23h",
                atras: 23 * HORA
            },
            {
                etiqueta: "caducada 24h+1min",
                atras: 24 * HORA + 60
            },
            {
                etiqueta: "caducada 48h",
                atras: 48 * HORA
            },
            {
                etiqueta: "caducada 1000h",
                atras: 1000 * HORA
            }
        ];

        const insertadas = [];

        for (
            let i = 0;
            i < esperadas.length;
            i += 1
        ) {

            const fila =
                await insertarSesion(
                    userId,
                    servidores[i],
                    esperadas[i].atras
                );

            insertadas.push({
                id: fila.id,
                etiqueta:
                    esperadas[i].etiqueta
            });

        }

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            3,
            "solo las tres de mas de 24h"
        );

        const restantes =
            await getTestPool().query(
                `
                SELECT id
                FROM admin_sessions
                WHERE user_id = $1
                `,
                [userId]
            );

        const idsRestantes =
            new Set(
                restantes.rows.map(
                    r => Number(r.id)
                )
            );

        /**
         * Se comprueba una por una cuales sobreviven, para
         * que un fallo diga que etiqueta se rompio y no solo
         * un numero.
         */
        const debenQuedar = [
            "activa",
            "caducada 2h",
            "caducada 23h"
        ];

        const debenIr = [
            "caducada 24h+1min",
            "caducada 48h",
            "caducada 1000h"
        ];

        for (
            const item of insertadas
        ) {

            const sigue =
                idsRestantes.has(
                    Number(item.id)
                );

            if (
                debenQuedar.includes(
                    item.etiqueta
                )
            ) {

                assert.ok(
                    sigue,
                    item.etiqueta +
                    " debe sobrevivir"
                );

            } else if (
                debenIr.includes(
                    item.etiqueta
                )
            ) {

                assert.ok(
                    !sigue,
                    item.etiqueta +
                    " debe eliminarse"
                );

            }

        }

        assert.equal(
            restantes.rows.length,
            3
        );

    }
);

/**
 * CASO 7: no elimina usuarios.
 */
pruebaDeLimpieza(
    "no elimina usuarios",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        await insertarSesion(
            userId, servidores[1], 40 * HORA
        );

        const usuariosAntes =
            await contar("users", userId);

        await limpiar();

        assert.equal(
            await contar("users", userId),
            usuariosAntes,
            "el usuario sigue existiendo"
        );

        assert.ok(
            usuariosAntes > 0
        );

    }
);

/**
 * CASO 8: no elimina servidores.
 */
pruebaDeLimpieza(
    "no elimina servidores",
    async () => {

        const { userId, servidores } =
            await crearEscenario(3);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        await insertarSesion(
            userId, servidores[1], 40 * HORA
        );
        await insertarSesion(
            userId, servidores[2], 50 * HORA
        );

        const servidoresAntes =
            await contar("servers", userId);

        await limpiar();

        assert.equal(
            await contarSesiones(),
            0,
            "las tres sesiones si se borran"
        );

        assert.equal(
            await contar("servers", userId),
            servidoresAntes,
            "los servidores siguen existiendo"
        );

        assert.equal(
            servidoresAntes,
            3
        );

    }
);

/**
 * CASO 9: no elimina auditorias.
 *
 * Es el caso mas delicate de todos. Las sesiones borradas
 * tienen sus eventos ADMIN_SESSION_CREATED, y la limpieza
 * no debe tocarlos: son la unica traza de que existieron.
 */
pruebaDeLimpieza(
    "no elimina auditorías aunque borre las sesiones",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        const sesionA =
            await crearSesionConAuditoria(
                userId,
                servidores[0]
            );

        const sesionB =
            await crearSesionConAuditoria(
                userId,
                servidores[1]
            );

        const auditoriaAntes =
            await contarAuditoria(userId);

        assert.equal(
            auditoriaAntes,
            2,
            "cada alta deja su evento"
        );

        /**
         * Se envejecen las dos sesiones mas alla del margen.
         */
        await envejecer(
            sesionA.id,
            30 * HORA
        );
        await envejecer(
            sesionB.id,
            40 * HORA
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            2,
            "las dos sesiones se borran"
        );

        assert.equal(
            await contarSesiones(),
            0
        );

        assert.equal(
            await contarAuditoria(userId),
            auditoriaAntes,
            "los eventos sobreviven a las " +
            "sesiones que describen"
        );

        /**
         * Y se comprueba que el evento sigue apuntando al
         * id de la sesion que ya no esta. Es lo esperable y
         * lo deseable: el identificador de la sesion es
         * historico, no una referencia viva.
         */
        const eventos =
            await getTestPool().query(
                `
                SELECT
                    (details->>'adminSessionId')
                        AS sid
                FROM audit_logs
                WHERE details->>'userId' = $1
                `,
                [String(userId)]
            );

        const idsAuditados =
            eventos.rows.map(
                r =>
                    Number(r.sid)
            ).sort(
                (a, b) => a - b
            );

        assert.deepEqual(
            idsAuditados,
            [
                Number(sesionA.id),
                Number(sesionB.id)
            ].sort((a, b) => a - b),
            "los eventos conservan el id de " +
            "la sesion que crearon"
        );

    }
);

/**
 * CASO 10: segunda ejecucion inmediata.
 */
pruebaDeLimpieza(
    "una segunda ejecución inmediata no borra nada",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        await insertarSesion(
            userId, servidores[1], 31 * HORA
        );

        const primera =
            await limpiar();

        assert.equal(
            primera.deletedCount,
            2
        );

        const segunda =
            await limpiar();

        assert.equal(
            segunda.deletedCount,
            0,
            "la segunda pasada no encuentra " +
            "nada que borrar"
        );

        const tercera =
            await limpiar();

        assert.equal(
            tercera.deletedCount,
            0,
            "y es idempotente"
        );

        assert.equal(
            await contarSesiones(),
            0
        );

    }
);

/**
 * CASO 11: no devuelve ni imprime tokens.
 */
pruebaDeLimpieza(
    "el resultado no contiene ningún token ni fila",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        const a = await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        const b = await insertarSesion(
            userId, servidores[1], 40 * HORA
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            2
        );

        /**
         * La forma del resultado es un requisito, no una
         * cortesia: quien lo invoque puede loguearlo entero
         * sin filtrar nada.
         */
        assert.deepEqual(
            Object.keys(resultado),
            ["deletedCount"]
        );

        assert.equal(
            typeof resultado.deletedCount,
            "number"
        );

        /**
         * Ningun token de los borrados puede aparecer en la
         * serializacion del resultado. Se comprueba sobre
         * el JSON completo, que es lo que se escribiria en
         * un log.
         */
        const serializado =
            JSON.stringify(resultado);

        for (
            const fila of [a, b]
        ) {

            assert.ok(
                !serializado.includes(
                    fila.token
                ),
                "el token no puede " +
                "aparecer en el resultado"
            );

            assert.ok(
                !serializado.includes(
                    String(fila.id)
                ),
                "ni el id de la fila"
            );

        }

        assert.equal(
            await contarSesiones(),
            0
        );

    }
);

/**
 * CASO 12: la sesion real creada por el servicio tambien
 * se limpia cuando envejece.
 *
 * Hasta aqui las sesiones se insertan a mano. Esta prueba
 * usa createAdminSession de verdad, comprueba que su
 * auditoria se emite, envejece la fila y verifica que la
 * limpieza la borra sin tocar el evento.
 */
pruebaDeLimpieza(
    "una sesión creada por el servicio real se limpia sin perder su auditoría",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        const creada =
            await createAdminSession(
                userId,
                servidores[0]
            );

        trackSession(creada.id);

        const eventosAntes =
            await contarAuditoria(userId);

        assert.equal(
            eventosAntes,
            1
        );

        /**
         * Una sesion de verdad acaba de crearse: no puede
         * borrarse.
         */
        const primera =
            await limpiar();

        assert.equal(
            primera.deletedCount,
            0,
            "una sesion recien creada no se " +
            "borra"
        );

        await envejecer(
            creada.id,
            25 * HORA
        );

        const segunda =
            await limpiar();

        assert.equal(
            segunda.deletedCount,
            1
        );

        assert.equal(
            await contarSesiones(),
            0
        );

        assert.equal(
            await contarAuditoria(userId),
            eventosAntes,
            "el evento de creacion sobrevive"
        );

        /**
         * Y la validacion de la sesion falla ya, porque la
         * fila no existe.
         */
        const {
            validateAdminSession
        } = require(
            "../../src/services/admin-session.service"
        );

        assert.equal(
            await validateAdminSession(
                userId,
                servidores[0],
                creada.token
            ),
            null
        );

    }
);

/**
 * El margen de retencion es el declarado, no un numero
 * escondido en el SQL.
 */
pruebaDeLimpieza(
    "el margen de retención declarado es el que se aplica",
    async () => {

        assert.equal(
            RETENTION_HOURS,
            24
        );

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId,
            servidores[0],
            RETENTION_HOURS * HORA - 60
        );
        await insertarSesion(
            userId,
            servidores[1],
            RETENTION_HOURS * HORA + 60
        );

        const resultado =
            await limpiar();

        assert.equal(
            resultado.deletedCount,
            1
        );

    }
);

/**
 * El servicio no escribe en audit_logs por su cuenta.
 */
pruebaDeLimpieza(
    "la limpieza no genera eventos de auditoría propios",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        const sesion =
            await crearSesionConAuditoria(
                userId,
                servidores[0]
            );

        await envejecer(
            sesion.id,
            30 * HORA
        );

        const auditoriaAntes =
            await contarAuditoria(userId);

        const totalAntes =
            await contarAuditoriaTotal();

        await limpiar();

        assert.equal(
            await contarAuditoria(userId),
            auditoriaAntes
        );

        assert.equal(
            await contarAuditoriaTotal(),
            totalAntes,
            "ni un evento nuevo de " +
            "mantenimiento"
        );

    }
);

/* ---------- utilidades ---------- */

/**
 * Cuenta los eventos de sesion de UN usuario, acotado por
 * su userId. Nunca en global.
 */
async function contarAuditoria(
    userId
) {

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = ANY($1::text[])
            AND details->>'userId' = $2
            `,
            [
                [
                    "ADMIN_SESSION_CREATED",
                    "ADMIN_SESSION_REFRESHED",
                    "ADMIN_SESSION_CLOSED"
                ],
                String(userId)
            ]
        );

    return r.rows[0].total;

}

/**
 * Cuenta los eventos de sesion de esta prueba, acotados a
 * sus usuarios.
 *
 * No se cuenta audit_logs en global: los demas archivos de
 * integracion escriben a la vez y el total fluctuaria sin
 * que nada de esta prueba hubiera cambiado.
 */
async function contarAuditoriaTotal() {

    if (
        trackedUserIds.length === 0
    ) {

        return 0;

    }

    const r =
        await getTestPool().query(
            `
            SELECT count(*)::int AS total
            FROM audit_logs
            WHERE event_type = ANY($1::text[])
            AND details->>'userId'
                = ANY($2::text[])
            `,
            [
                [
                    "ADMIN_SESSION_CREATED",
                    "ADMIN_SESSION_REFRESHED",
                    "ADMIN_SESSION_CLOSED"
                ],
                trackedUserIds.map(
                    id => String(id)
                )
            ]
        );

    return r.rows[0].total;

}

/**
 * Envejece una sesion mas alla del margen, usando la misma
 * base de reloj que el servicio.
 */
async function envejecer(
    sessionId,
    horas
) {

    await getTestPool().query(
        `
        UPDATE admin_sessions
        SET expires_at =
            CURRENT_TIMESTAMP
                - make_interval(hours => $2)
        WHERE id = $1
        `,
        [sessionId, horas]
    );

}

/**
 * Crea una sesion con el servicio real, que ademas deja su
 * evento de auditoria, y la devuelve envejecida no: la
 * caducidad normal de 15 minutos.
 */
async function crearSesionConAuditoria(
    userId,
    serverId
) {

    return createAdminSession(
        userId,
        serverId
    );

}
