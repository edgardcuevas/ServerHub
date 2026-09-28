/**
 * JOB DE LIMPIEZA DE SESIONES ADMINISTRATIVAS.
 *
 * Estas pruebas son unitarias y NO se conectan a PostgreSQL.
 * Para lograrlo no se ha tocado el codigo productivo: el
 * aislamiento se hace inyectando un stub en require.cache
 * ANTES de cargar el job.
 *
 * El mecanismo es el propio de CommonJS. Si la entrada del
 * modulo de servicio ya esta en require.cache con el
 * stub, el require del job la devuelve sin llegar a leer el
 * archivo, de modo que ../../config/db nunca se carga y no
 * se abre ningun Pool. Es comprobable: al final del archivo
 * se verifica que config/db no aparece en require.cache.
 *
 * Entre pruebas se detiene el cron con el stop() del objeto
 * de control, de modo que no quedan tareas ni timers vivos
 * y el caso 10 de aislamiento se cumple de verdad.
 */

const {
    test,
    beforeEach,
    afterEach,
    after
} = require("node:test");

const assert =
    require("node:assert/strict");

const path = require("path");

const Module = require("module");

const cron = require("node-cron");

const RUTA_SERVICIO =
    path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "services",
        "admin-session-cleanup.service.js"
    );

const RUTA_JOB =
    path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "jobs",
        "admin-session-cleanup.job.js"
    );

/**
 * Comportamiento del stub. Cada prueba lo reconfigura.
 */
let comportamiento = () => ({
    deletedCount: 0
});

let llamadasAlServicio = 0;

const parametrosRecibidos = [];

/**
 * Carga el job con el servicio aislado.
 *
 * Se construyen a mano el Module y su _compile porque el job
 * se tiene que cargar DESPUES de inyectar el stub, y
 * require.cache es el unico orden de carga que respeta el
 * orden de una inyeccion previa sin tocar el job.
 */
function cargarJobAislado() {

    require.cache[RUTA_SERVICIO] = {
        exports: {
            cleanupExpiredAdminSessions: (
                ...args
            ) => {

                llamadasAlServicio += 1;
                parametrosRecibidos.push(args);

                return comportamiento(...args);

            }
        },
        id: RUTA_SERVICIO,
        filename: RUTA_SERVICIO,
        loaded: true,
        children: [],
        paths: Module._nodeModulePaths(
            path.dirname(RUTA_SERVICIO)
        )
    };

    delete require.cache[RUTA_JOB];

    const modulo = new Module(
        "admin-session-cleanup.job.aislado",
        null
    );
    modulo.filename = RUTA_JOB;
    modulo.paths = Module._nodeModulePaths(
        path.dirname(RUTA_JOB)
    );
    modulo.require = (p) =>
        Module._load(p, modulo, false);

    const fuente = require("fs")
        .readFileSync(RUTA_JOB, "utf8");

    modulo._compile(fuente, RUTA_JOB);

    return modulo.exports;

}

/**
 * Captura de console.log y console.error durante una
 * accion.
 */
async function capturandoConsola(
    accion
) {

    const registros = {
        log: [],
        error: []
    };

    const logOriginal = console.log;
    const errorOriginal = console.error;

    console.log = (...args) => {
        registros.log.push(
            args.join(" ")
        );
    };
    console.error = (...args) => {
        registros.error.push(
            args.join(" ")
        );
    };

    try {

        const valor = await accion();

        return {
            valor,
            registros
        };

    } finally {

        console.log = logOriginal;
        console.error = errorOriginal;

    }

}

let job = null;

/**
 * Limpia la tarea de la prueba anterior, si la hubiera.
 */
function detenerJobPrevio() {

    if (job === null) {
        return;
    }

    job.startAdminSessionCleanupJob()
        .stop();

    job = null;

}

beforeEach(() => {

    detenerJobPrevio();

    llamadasAlServicio = 0;
    parametrosRecibidos.length = 0;
    comportamiento = () => ({
        deletedCount: 0
    });

    job = cargarJobAislado();

});

afterEach(async () => {

    /**
     * Se detiene el cron de cada prueba. Si el job se
     *chedule dos veces, stop() solo detiene la vigente, asi
     * que se reintente hasta que no quede ninguna.
     */
    if (job !== null) {
        await Promise.resolve();
        job.startAdminSessionCleanupJob()
            .stop();
        job = null;
    }

    /**
     * node-cron 4 conserva en getTasks() las tareas paradas,
     * asi que un tamano distinto de cero no basta para
     * detectar una fuga. Lo que importa es que ninguna
     * tarea quede en un estado vivo.
     */
    const pendientes = [
        ...cron.getTasks().values()
    ];

    for (const tarea of pendientes) {
        assert.equal(
            tarea.getStatus(),
            "stopped",
            "ninguna prueba debe dejar " +
            "tareas de cron vivas"
        );
    }

});

after(() => {

    delete require.cache[RUTA_SERVICIO];
    delete require.cache[RUTA_JOB];

});

/**
 * Tareas de cron vivas ahora mismo. Una tarea detenida se
 * sigue listando en node-cron 4, asi que se filtra por
 * estado.
 */
function tareasVivas() {

    return [
        ...cron.getTasks().values()
    ].filter(
        tarea => {
            const estado =
                tarea.getStatus();
            return (
                estado !== "stopped" &&
                estado !== "destroyed"
            );
        }
    );

}

/**
 * CASO 1: la expresion cron es la correcta.
 */
test(
    "programa el cron con */15 * * * *",
    async () => {

        const { valor } =
            await capturandoConsola(
                async () =>
                    job.startAdminSessionCleanupJob()
            );

        await valor.getStartupPromise();

        assert.equal(
            valor.CRON_EXPRESSION,
            "*/15 * * * *"
        );

        /**
         * Se comprueba sobre la tarea real de node-cron, no
         * solo sobre la constante del job: asi se verifica
         * que la expresion llego de verdad al planificador.
         */
        const vivas = tareasVivas();

        assert.equal(
            vivas.length,
            1,
            "debe haber exactamente una " +
            "tarea viva"
        );

        assert.equal(
            vivas[0].getPattern(),
            "*/15 * * * *"
        );

    }
);

/**
 * CASO 2: importar el modulo no arranca nada.
 */
test(
    "importar el módulo no programa ningún cron",
    async () => {

        /**
         * beforeEach ya cargo el job. En este punto, antes de
         * llamar a start, no debe haber ninguna tarea viva.
         */
        assert.equal(
            tareasVivas().length,
            0,
            "cargar el modulo no debe " +
            "programar nada"
        );

        assert.equal(
            llamadasAlServicio,
            0,
            "ni llamar al servicio"
        );

        const control =
            job.startAdminSessionCleanupJob();

        assert.equal(
            control.isScheduled(),
            true,
            "y solo al arrancar pasa a true"
        );

    }
);

/**
 * CASO 3: la ejecucion inicial llama al servicio una vez.
 */
test(
    "la ejecución inicial llama al servicio una sola vez",
    async () => {

        comportamiento = () => ({
            deletedCount: 5
        });

        const { valor, registros } =
            await capturandoConsola(
                async () =>
                    job.startAdminSessionCleanupJob()
            );

        const inicial =
            await valor.getStartupPromise();

        assert.equal(
            llamadasAlServicio,
            1
        );

        assert.equal(
            inicial.deletedCount,
            5
        );

        assert.equal(
            inicial.execution,
            "startup",
            "la pasada inicial se " +
            "identifica como startup"
        );

        assert.equal(
            inicial.skipped,
            false
        );

        assert.equal(
            inicial.failed,
            false
        );

        assert.deepEqual(
            registros.log,
            ["Sesiones administrativas " +
             "expiradas eliminadas: 5"]
        );

    }
);

/**
 * CASO 4: una ejecucion programada llama al servicio.
 *
 * No se esperan 15 minutos: se invoca runAdminSessionCleanup
 * con el origen scheduled, que es exactamente lo que hace el
 * callback del cron.
 */
test(
    "una ejecución programada llama al servicio",
    async () => {

        /**
         * La primera pasada, la de arranque, devuelve 0 y la
         * segunda devuelve 2, para comprobar que cada log
         * refleja SU conteo y no arrastra el anterior.
         */
        const secuencia = [0, 2];

        comportamiento = () => ({
            deletedCount: secuencia.shift()
        });

        const { valor, registros } =
            await capturandoConsola(
                async () => {

                    await job.startAdminSessionCleanupJob()
                        .getStartupPromise();

                    return job.runAdminSessionCleanup(
                        "scheduled"
                    );

                }
            );

        assert.equal(
            llamadasAlServicio,
            2,
            "la inicial y la programada"
        );

        assert.equal(
            valor.execution,
            "scheduled"
        );

        assert.equal(
            valor.deletedCount,
            2
        );

        assert.deepEqual(
            registros.log,
            [
                "Sesiones administrativas " +
                    "expiradas eliminadas: 0",
                "Sesiones administrativas " +
                    "expiradas eliminadas: 2"
            ],
            "cada pasada reporta su propio " +
            "conteo, sin arrastrar el anterior"
        );

    }
);

/**
 * CASO 5: dos ejecuciones simultaneas.
 */
test(
    "dos ejecuciones simultáneas: solo una llega al servicio",
    async () => {

        let liberar;

        const espera =
            new Promise(
                resolver => {
                    liberar = resolver;
                }
            );

        /**
         * La primera pasada se queda bloqueada dentro del
         * servicio, de modo que la segunda arranca mientras
         * isRunning sigue en true.
         */
        comportamiento =
            async () => {

                await espera;

                return {
                    deletedCount: 1
                };

            };

        const primera =
            job.runAdminSessionCleanup("scheduled");

        /**
         * Un microtask basta para que la primera pasada
         * haya fijado la bandera y entrado en el servicio.
         */
        await new Promise(
            resolver =>
                setImmediate(resolver)
        );

        assert.equal(
            llamadasAlServicio,
            1,
            "la primera ya esta dentro"
        );

        const { valor: segunda, registros } =
            await capturandoConsola(
                async () =>
                    job.runAdminSessionCleanup("scheduled")
            );

        assert.equal(
            llamadasAlServicio,
            1,
            "la segunda NO llega al servicio"
        );

        assert.equal(
            segunda.skipped,
            true
        );

        assert.equal(
            segunda.failed,
            false
        );

        assert.equal(
            segunda.deletedCount,
            0
        );

        assert.deepEqual(
            registros.log,
            ["Limpieza de sesiones " +
             "administrativas omitida: " +
             "ejecución anterior activa"]
        );

        liberar();

        const r1 = await primera;

        assert.equal(
            r1.skipped,
            false,
            "la primera no se omite"
        );

        assert.equal(
            r1.deletedCount,
            1
        );

    }
);

/**
 * CASO 6: si el servicio falla.
 */
test(
    "un fallo del servicio no se propaga y la bandera se restablece",
    async () => {

        const { valor, registros } =
            await capturandoConsola(
                async () => {

                    /**
                     * La primera pasada falla.
                     */
                    comportamiento = () => {
                        throw new Error(
                            "boom de prueba"
                        );
                    };

                    const fallida =
                        await job.runAdminSessionCleanup(
                            "scheduled"
                        );

                    /**
                     * La segunda funciona, lo que demuestra
                     * que isRunning volvio a false.
                     */
                    comportamiento = () => ({
                        deletedCount: 3
                    });

                    const posterior =
                        await job.runAdminSessionCleanup(
                            "scheduled"
                        );

                    return {
                        fallida,
                        posterior
                    };

                }
            );

        assert.equal(
            valor.fallida.failed,
            true
        );

        assert.equal(
            valor.fallida.skipped,
            false
        );

        assert.equal(
            valor.fallida.deletedCount,
            0
        );

        assert.equal(
            valor.posterior.failed,
            false
        );

        assert.equal(
            valor.posterior.deletedCount,
            3,
            "una pasada posterior funciona, " +
            "asi que la bandera se libero"
        );

        assert.equal(
            llamadasAlServicio,
            2
        );

        assert.deepEqual(
            registros.error,
            ["Error limpiando sesiones " +
             "administrativas expiradas"]
        );

    }
);

/**
 * El log de error es un texto fijo: no puede filtrar el
 * mensaje del error, que en PostgreSQL puede traer query y
 * detail.
 */
test(
    "el log de error no incluye el mensaje del error",
    async () => {

        const { valor, registros } =
            await capturandoConsola(
                async () => {

                    const secreto =
                        "SELECT token FROM " +
                        "admin_sessions WHERE " +
                        "token = 'abc123'";

                    comportamiento = () => {
                        const error =
                            new Error(
                                secreto
                            );
                        error.query = secreto;
                        error.detail =
                            "detalle sensible";
                        throw error;
                    };

                    const r =
                        await job.runAdminSessionCleanup(
                            "scheduled"
                        );

                    return { r };

                }
            );

        const todo =
            registros.error.join(" ") +
            " " +
            JSON.stringify(valor.r);

        assert.equal(
            valor.r.failed,
            true
        );

        assert.ok(
            !todo.includes("abc123"),
            "el token no puede aparecer"
        );

        assert.ok(
            !todo.includes(
                "admin_sessions WHERE"
            ),
            "el SQL no puede aparecer"
        );

        assert.ok(
            !todo.includes("detalle sensible"),
            "el detail no puede aparecer"
        );

        assert.equal(
            registros.error.length,
            1
        );

    }
);

/**
 * CASO 7: el resultado exitoso solo lleva lo permitido.
 */
test(
    "el resultado exitoso solo contiene deletedCount y metadatos de control",
    async () => {

        comportamiento = () => ({
            deletedCount: 4,
            token: "no-debe-aparecer",
            filas: [{ id: 1 }]
        });

        const { valor } =
            await capturandoConsola(
                async () =>
                    job.runAdminSessionCleanup("scheduled")
            );

        assert.deepEqual(
            Object.keys(valor).sort(),
            [
                "deletedCount",
                "execution",
                "failed",
                "skipped"
            ],
            "solo cuatro claves de control"
        );

        assert.equal(
            valor.deletedCount,
            4
        );

        assert.equal(
            typeof valor.deletedCount,
            "number"
        );

    }
);

/**
 * CASO 8: el resultado omitido no lleva datos internos.
 */
test(
    "el resultado omitido no contiene tokens ni datos internos",
    async () => {

        let liberar;

        const espera =
            new Promise(
                resolver => {
                    liberar = resolver;
                }
            );

        comportamiento =
            async () => {

                await espera;

                return {
                    deletedCount: 1
                };

            };

        const primera =
            job.runAdminSessionCleanup("scheduled");

        await new Promise(
            resolver =>
                setImmediate(resolver)
        );

        const omitida =
            await job.runAdminSessionCleanup("scheduled");

        assert.equal(
            omitida.skipped,
            true
        );

        assert.deepEqual(
            Object.keys(omitida).sort(),
            [
                "deletedCount",
                "execution",
                "failed",
                "skipped"
            ]
        );

        const serializado =
            JSON.stringify(omitida);

        assert.ok(
            !serializado.includes("token")
        );
        assert.ok(
            !serializado.includes("id")
        );
        assert.ok(
            !serializado.includes("row")
        );

        liberar();
        await primera;

    }
);

/**
 * CASO 9: el job puede detenerse.
 */
test(
    "el job puede detenerse y se puede arrancar de nuevo",
    async () => {

        const { valor } =
            await capturandoConsola(
                async () => {

                    const control =
                        job.startAdminSessionCleanupJob();

                    await control
                        .getStartupPromise();

                    const antes =
                        control.isScheduled();

                    const estadoAntes =
                        control.getStatus();

                    control.stop();

                    const despues =
                        control.isScheduled();

                    /**
                     * Volver a arrancar debe funcionar, para
                     * que un reinicio del job no quede
                     * inutilizado.
                     */
                    const otra =
                        control.start();

                    await otra
                        .getStartupPromise();

                    return {
                        antes,
                        despues,
                        estadoAntes,
                        vivas:
                            tareasVivas().length
                    };

                }
            );

        assert.equal(
            valor.antes,
            true
        );

        assert.equal(
            valor.despues,
            false
        );

        assert.equal(
            typeof valor.estadoAntes,
            "string"
        );

        assert.equal(
            valor.vivas,
            1,
            "tras reiniciar hay una sola " +
            "tarea viva, no dos"
        );

    }
);

/**
 * Arranque cuando la limpieza inicial falla.
 *
 * Es la prueba de que un fallo de mantenimiento no tumba
 * el backend: el cron queda programado, la promesa inicial
 * se resuelve en lugar de rechazar, y no hay
 * unhandledRejection.
 */
test(
    "el backend puede continuar aunque la limpieza inicial falle",
    async () => {

        const rechazos = [];

        const alRechazar = (razon) => {
            rechazos.push(razon);
        };

        process.on(
            "unhandledRejection",
            alRechazar
        );

        try {

            const { valor, registros } =
                await capturandoConsola(
                    async () => {

                        /**
                         * Falla desde la PRIMERA pasada,
                         * la de arranque.
                         */
                        comportamiento = () => {
                            throw new Error(
                                "la base no " +
                                    "responde"
                            );
                        };

                        const control =
                            job.startAdminSessionCleanupJob();

                        /**
                         * Esperar un turno completo de
                         * event loop para que cualquier
                         * rechazo sin capturar tendria
                         * tiempo de dispararse.
                         */
                        await new Promise(
                            resolver =>
                                setTimeout(
                                    resolver, 20
                                )
                        );

                        return { control };

                    }
                );

            /**
             * La promesa inicial se RESUELVE, con failed
             * true. No rechaza.
             */
            const inicial =
                await valor.control
                    .getStartupPromise();

            assert.equal(
                inicial.failed,
                true
            );

            assert.equal(
                inicial.deletedCount,
                0
            );

            assert.equal(
                inicial.execution,
                "startup"
            );

            /**
             * Y el cron sigue programmed pese al fallo.
             */
            assert.equal(
                valor.control.isScheduled(),
                true
            );

            assert.equal(
                tareasVivas().length,
                1,
                "el cron sigue programado " +
                "pese al fallo inicial"
            );

            assert.deepEqual(
                registros.error,
                ["Error limpiando sesiones " +
                 "administrativas expiradas"]
            );

            /**
             * La pasada siguiente funciona: el trabajo
             * pendiente se recupera.
             */
            comportamiento = () => ({
                deletedCount: 9
            });

            const posterior =
                await job.runAdminSessionCleanup(
                    "scheduled"
                );

            assert.equal(
                posterior.failed,
                false
            );

            assert.equal(
                posterior.deletedCount,
                9
            );

            assert.equal(
                rechazos.length,
                0,
                "no debe haber " +
                "unhandledRejection"
            );

        } finally {

            process.off(
                "unhandledRejection",
                alRechazar
            );

        }

    }
);

/**
 * El servicio real nunca se cargo: no se abrio un Pool.
 *
 * Es la comprobacion que respalda la premisa de que estas
 * pruebas son unitarias.
 *
 * Comprobar el .name de la funcion no serviria de nada: el
 * motor infiere el nombre de la propiedad, asi que el stub
 * se llamaria igual que la funcion real. Lo que si es
 * concluyente es invocar la funcion que hay en cache y
 * comprobar que ES el stub, porque solo el stub incrementa
 * el contador de llamadas y devuelve el valor configurado.
 */
test(
    "el módulo real del servicio no se cargó y no se abrió ningún Pool",
    async () => {

        const cargados =
            Object.keys(require.cache)
                .filter(
                    k => k.includes(
                        "config" +
                        path.sep + "db"
                    )
                );

        assert.deepEqual(
            cargados,
            [],
            "config/db no debe estar en " +
            "require.cache: el job uso el stub"
        );

        const enCache =
            require.cache[RUTA_SERVICIO];

        assert.ok(
            enCache,
            "el stub esta inyectado en cache"
        );

        const antes = llamadasAlServicio;

        const r =
            await enCache.exports
                .cleanupExpiredAdminSessions();

        assert.equal(
            llamadasAlServicio,
            antes + 1,
            "la funcion del cache cuenta la " +
            "llamada: es el stub, no la real"
        );

        assert.deepEqual(
            r,
            { deletedCount: 0 },
            "y devuelve lo que el stub " +
            "configura, sin tocar PostgreSQL"
        );

    }
);