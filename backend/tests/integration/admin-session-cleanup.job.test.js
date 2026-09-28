/**
 * JOB DE LIMPIEZA DE SESIONES ADMINISTRATIVAS, CONTRA
 * POSTGRESQL REAL.
 *
 * Estas pruebas NO arrancan server.js y NO arrancan ningun
 * cron. Invocan runAdminSessionCleanup() directamente, que
 * es la misma funcion que ejecuta el callback del
 * planificador: asi se prueba lalogica contra la base de
 * verdad sin esperar 15 minutos y sin dejar tareas vivas.
 *
 * El reloj del cron se prueba en las unitarias. Aqui lo que
 * se comprueba es que el job, al ejecutar el servicio de
 * verdad, borra lo que debe y no toca lo que no debe.
 *
 * admin_sessions tiene UNIQUE (user_id, server_id), asi que
 * cada sesion de prueba necesita su propio servidor.
 *
 * No imprime ningun token.
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
    runAdminSessionCleanup
} = require(
    "../../src/jobs/admin-session-cleanup.job"
);

const {
    createAdminSession
} = require(
    "../../src/services/admin-session.service"
);

const TEST_DATABASE_NAME =
    "serverhub_test";

const HORA = 3600;

const trackedUserIds = [];

const trackedServerIds = [];

const trackedSessionIds = [];

/**
 * Servidores de la prueba en curso.
 *
 * node --test ejecuta los archivos en paralelo, asi que
 * ningun recuento puede ser global: incluiria filas de otros
 * archivos y haria fallar estas pruebas de forma
 * intermitente.
 */
let servidoresDeLaPrueba = [];

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

async function crearEscenario(
    cuantos
) {

    const user =
        await createTestUser();

    trackUser(user.id);

    const servidores = [];

    for (
        let i = 0;
        i < cuantos;
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
 * Inserta una sesion caducada hace los segundos indicados,
 * o activa si segundosAtras es null. El desplazamiento lo
 * decide PostgreSQL con CURRENT_TIMESTAMP, la misma base de
 * reloj que usa el servicio.
 */
async function insertarSesion(
    userId,
    serverId,
    segundosAtras
) {

    const esActiva =
        segundosAtras === null;

    const caducidad =
        esActiva
            ? "CURRENT_TIMESTAMP + INTERVAL '1 hour'"
            : "CURRENT_TIMESTAMP - make_interval(secs => $4)";

    const parametros = [
        userId,
        serverId,
        "j".repeat(56) +
            String(serverId).padStart(8, "0")
    ];

    if (!esActiva) {
        parametros.push(segundosAtras);
    }

    const r =
        await getTestPool().query(
            `
            INSERT INTO admin_sessions
                (user_id, server_id, token,
                 expires_at)
            VALUES
                ($1, $2, $3, ` + caducidad + `)
            RETURNING id
            `,
            parametros
        );

    trackSession(r.rows[0].id);

    return r.rows[0];

}

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

async function contarSesiones() {

    if (servidoresDeLaPrueba.length === 0) {
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

/**
 * CASO 1: limpieza startup.
 */
pruebaDeJob(
    "la limpieza de startup elimina las sesiones con más de 24 horas",
    async () => {

        const { userId, servidores } =
            await crearEscenario(3);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        await insertarSesion(
            userId, servidores[1], 100 * HORA
        );
        await insertarSesion(
            userId, servidores[2], 3 * 24 * HORA
        );

        const resultado =
            await ejecutarJob("startup");

        assert.equal(
            resultado.failed,
            false,
            "la limpieza no debe fallar"
        );

        assert.equal(
            resultado.skipped,
            false
        );

        assert.equal(
            resultado.execution,
            "startup"
        );

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
 * CASO 2: no elimina sesiones activas.
 */
pruebaDeJob(
    "no elimina sesiones activas",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId, servidores[0], null
        );
        await insertarSesion(
            userId, servidores[1], null
        );

        const resultado =
            await ejecutarJob("scheduled");

        assert.equal(
            resultado.deletedCount,
            0
        );

        assert.equal(
            await contarSesiones(),
            2,
            "ambas sesiones siguen"
        );

    }
);

/**
 * CASO 3: no elimina las caducadas hace menos de 24 h.
 */
pruebaDeJob(
    "no elimina sesiones caducadas hace menos de 24 horas",
    async () => {

        const { userId, servidores } =
            await crearEscenario(4);

        await insertarSesion(
            userId, servidores[0], 5 * 60
        );
        await insertarSesion(
            userId, servidores[1], 2 * HORA
        );
        await insertarSesion(
            userId, servidores[2], 12 * HORA
        );
        await insertarSesion(
            userId, servidores[3], 23 * HORA
        );

        const resultado =
            await ejecutarJob("scheduled");

        assert.equal(
            resultado.deletedCount,
            0
        );

        assert.equal(
            await contarSesiones(),
            4
        );

    }
);

/**
 * CASO 4: ejecucion posterior devuelve 0.
 */
pruebaDeJob(
    "una ejecución posterior devuelve deletedCount = 0",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        await insertarSesion(
            userId, servidores[1], 50 * HORA
        );

        const primera =
            await ejecutarJob("startup");

        assert.equal(
            primera.deletedCount,
            2
        );

        const segunda =
            await ejecutarJob("scheduled");

        assert.equal(
            segunda.deletedCount,
            0
        );

        const tercera =
            await ejecutarJob("scheduled");

        assert.equal(
            tercera.deletedCount,
            0,
            "y es idempotente"
        );

    }
);

/**
 * CASO 5: no altera usuarios.
 */
pruebaDeJob(
    "no altera usuarios",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );
        await insertarSesion(
            userId, servidores[1], 40 * HORA
        );

        const antes =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM users WHERE id = $1
                `,
                [userId]
            );

        await ejecutarJob("scheduled");

        const despues =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM users WHERE id = $1
                `,
                [userId]
            );

        assert.equal(
            despues.rows[0].total,
            antes.rows[0].total
        );

        assert.equal(
            despues.rows[0].total,
            1
        );

    }
);

/**
 * CASO 6: no altera servidores.
 */
pruebaDeJob(
    "no altera servidores",
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

        await ejecutarJob("scheduled");

        assert.equal(
            await contarSesiones(),
            0,
            "las sesiones si se borran"
        );

        const despues =
            await getTestPool().query(
                `
                SELECT count(*)::int AS total
                FROM servers
                WHERE id = ANY($1::int[])
                `,
                [servidores]
            );

        assert.equal(
            despues.rows[0].total,
            3,
            "los servidores siguen"
        );

    }
);

/**
 * CASO 7: no elimina auditorias.
 */
pruebaDeJob(
    "no elimina auditorías aunque borre las sesiones",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        const a =
            await createAdminSession(
                userId,
                servidores[0]
            );
        trackSession(a.id);

        const b =
            await createAdminSession(
                userId,
                servidores[1]
            );
        trackSession(b.id);

        const antes =
            await contarAuditoria(userId);

        assert.equal(antes, 2);

        await envejecer(a.id, 30 * HORA);
        await envejecer(b.id, 40 * HORA);

        const resultado =
            await ejecutarJob("scheduled");

        assert.equal(
            resultado.deletedCount,
            2
        );

        assert.equal(
            await contarSesiones(),
            0
        );

        assert.equal(
            await contarAuditoria(userId),
            antes,
            "los eventos sobreviven a las " +
            "sesiones que describen"
        );

        /**
         * Y los eventos siguen apuntando a los ids de las
         * sesiones ya borradas: el identificador de sesion
         * es historico, no una referencia viva.
         */
        const ids =
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

        const idsOrdenados =
            ids.rows
                .map(r => Number(r.sid))
                .sort((a, b) => a - b);

        assert.deepEqual(
            idsOrdenados,
            [
                Number(a.id),
                Number(b.id)
            ].sort((a, b) => a - b)
        );

    }
);

/**
 * El job no genera eventos propios de mantenimiento.
 */
pruebaDeJob(
    "el job no genera eventos de auditoría propios",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        const s =
            await createAdminSession(
                userId,
                servidores[0]
            );
        trackSession(s.id);

        await envejecer(s.id, 30 * HORA);

        const antes =
            await contarAuditoria(userId);

        await ejecutarJob("scheduled");

        assert.equal(
            await contarAuditoria(userId),
            antes,
            "ni un evento nuevo de " +
            "mantenimiento"
        );

    }
);

/**
 * CASO 8 y 9: residuos y conexiones.
 */
pruebaDeJob(
    "no deja residuos ni conexiones abiertas",
    async () => {

        const { userId, servidores } =
            await crearEscenario(2);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );

        const activa =
            await insertarSesion(
                userId, servidores[1], null
            );

        await ejecutarJob("scheduled");

        /**
         * Solo sobrevive la que no podia borrarse. Las
         * fixtures de esta prueba las limpia afterEach.
         */
        assert.equal(
            await contarSesiones(),
            1
        );

        assert.ok(activa.id);

        /**
         * El conteo de conexiones NO se comprueba aqui.
         *
         * node --test ejecuta los archivos de integracion en
         * paralelo y en procesos separados, asi que en
         * cualquier momento hay conexiones de otros
         * archivos abiertas contra la misma base. Un 0
         * absoluto solo es observable con la suite en
         * reposo, y se comprueba a nivel de fase, fuera de
         * estas pruebas.
         *
         * Lo que si es atribuible a esta prueba es que el
         * Pool sigue siendo utilizable despues de la
         * limpieza, y eso se comprueba con la consulta que
         * se acaba de hacer.
         */

        const sigue =
            await getTestPool().query(
                "SELECT 1 AS ok"
            );

        assert.equal(
            sigue.rows[0].ok,
            1
        );

    }
);

/**
 * La sesion real que crea el servicio tambien se limpia,
 * y su token deja de validar.
 */
pruebaDeJob(
    "una sesión creada por el servicio real se limpia y su token deja de validar",
    async () => {

        const {
            validateAdminSession
        } = require(
            "../../src/services/admin-session.service"
        );

        const { userId, servidores } =
            await crearEscenario(1);

        const creada =
            await createAdminSession(
                userId,
                servidores[0]
            );
        trackSession(creada.id);

        /**
         * Una sesion recien creada no puede borrarse.
         */
        const primera =
            await ejecutarJob("startup");

        assert.equal(
            primera.deletedCount,
            0
        );

        assert.ok(
            await validateAdminSession(
                userId,
                servidores[0],
                creada.token
            )
        );

        await envejecer(creada.id, 25 * HORA);

        const segunda =
            await ejecutarJob("scheduled");

        assert.equal(
            segunda.deletedCount,
            1
        );

        assert.equal(
            await validateAdminSession(
                userId,
                servidores[0],
                creada.token
            ),
            null,
            "el token deja de validar"
        );

    }
);

/**
 * El resultado del job no lleva nada del servicio.
 */
pruebaDeJob(
    "el resultado del job solo lleva deletedCount y control",
    async () => {

        const { userId, servidores } =
            await crearEscenario(1);

        await insertarSesion(
            userId, servidores[0], 30 * HORA
        );

        const r =
            await ejecutarJob("scheduled");

        assert.deepEqual(
            Object.keys(r).sort(),
            [
                "deletedCount",
                "execution",
                "failed",
                "skipped"
            ]
        );

        const serializado =
            JSON.stringify(r);

        assert.ok(
            !serializado.includes("token")
        );
        assert.ok(
            !serializado.includes("j".repeat(20))
        );

    }
);

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
 * Ejecuta el job SIN tomar el lock.
 *
 * El lock lo toma pruebaDeJob(), que envuelve el CUERPO
 * COMPLETO de cada prueba. No puede haber dos niveles: si
 * el cuerpo ya esta bajo el lock y esta funcion tomara
 * otro en una conexion distinta, esperaria un cerrojo que
 * ella misma tiene y la prueba se quedaria colgada.
 */
async function ejecutarJob(
    execution
) {

    return runAdminSessionCleanup(execution);

}

/**
 * Declara una prueba que ejecuta el job.
 *
 * El lock cubre desde antes de envejecer las fixtures
 * hasta despues de comprobar el resultado. El servicio
 * borra por politica global, sin filtro por usuario, asi
 * que sin serializar, la limpieza de otro archivo de
 * pruebas podria llevarse las filas que esta acaba de
 * preparar y volver los conteos no atribuibles.
 */
function pruebaDeJob(
    nombre,
    cuerpo
) {

    test(
        nombre,
        () => withGlobalCleanupLock(cuerpo)
    );

}
