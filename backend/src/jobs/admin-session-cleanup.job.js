const cron = require("node-cron");

const {
    cleanupExpiredAdminSessions
} = require(
    "../services/admin-session-cleanup.service"
);

/**
 * Cada 15 minutos.
 *
 * La expresion solo decide CUANDO se intenta la limpieza.
 * La politica de que es caducado hace mas de 24 horas sigue
 * siendo del servicio, y este modulo no la repite ni la
 * calcula: no hay ninguna fecha en este archivo.
 *
 * La frecuencia no cambia que se borra, solo cuando. El
 * margen de 24 h hace que casi todas las pasadas no
 * encuentren nada, y ese coste es despreciable. A cambio,
 * ninguna sesion sobrevive mas de 24 h 15 min tras caducar,
 * y cada pasada toca pocas filas y tarda poco, sin alargar
 * un bloqueo sobre la tabla.
 */
const CRON_EXPRESSION =
    "*/15 * * * *";

/**
 * Origen de una ejecucion. Va en el resultado y en el
 * log, y no es mas que una etiqueta interna controlada por
 * este modulo.
 */
const EXECUTION_STARTUP =
    "startup";

const EXECUTION_SCHEDULED =
    "scheduled";

const SKIP_MESSAGE =
    "Limpieza de sesiones administrativas " +
    "omitida: ejecución anterior activa";

const SUCCESS_MESSAGE =
    "Sesiones administrativas expiradas " +
    "eliminadas: ";

const ERROR_MESSAGE =
    "Error limpiando sesiones administrativas " +
    "expiradas";

/**
 * Evita que dos limpiezas se solapen DENTRO de esta
 * instancia del backend.
 *
 * Alcance, y es importante no sobreinterpretarlo: protege
 * una unica instancia. Si el backend corre en dos procesos
 * o en dos maquinas, cada una tiene su propia bandera y las
 * dos pueden limpiar a la vez.
 *
 * Aqui no se resuelve, y a proposito: un bloqueo
 * distribuido necesita una tabla de locks o Redis, y esa
 * decision no se toma aqui. El riesgo de solapamiento es
 * bajo y benigno, porque el DELETE es idempotente: la
 * segunda pasada no encuentra las filas que la primera ya
 * borro y devuelve deletedCount = 0. Lo que se pierde es la
 * precision del conteo, no la correccion de la limpieza.
 */
let isRunning = false;

/**
 * Tarea programada vigente. Se guarda en el modulo para
 * poder detenerla, y para no programar una segunda si el
 * job se arranca dos veces.
 */
let scheduledTask = null;

/**
 * Promesa de la limpieza inicial. Se expone en el objeto de
 * control para que las pruebas puedan esperarla, en lugar
 * de esperar 15 minutos.
 */
let startupPromise = null;

/**
 * Una pasada de limpieza.
 *
 * NUNCA rechaza. Un rechazo aqui seria fatal por dos
 * motivos: si la promesa inicial se rechaza sin capturar se
 * convierte en unhandledRejection, y si la ejecuta node-cron
 * puede detener el proceso. Por eso el fallo se registra y
 * se convierte en un resultado.
 *
 * El resultado solo lleva deletedCount y dos banderas de
 * control. No lleva el error, ni filas, ni ids, ni tokens:
 * quien lo reciba puede registrarlo entero sin filtrar nada.
 *
 * @param {string} execution EXECUTION_STARTUP o
 *                        EXECUTION_SCHEDULED
 * @returns {Promise<object>} { skipped, failed,
 *                 deletedCount, execution }
 */
async function runAdminSessionCleanup(
    execution = EXECUTION_SCHEDULED
) {

    /**
     * Solapamiento. Se devuelve un resultado de omision en
     * lugar de lanzar, y no se toca el servicio.
     */
    if (isRunning) {

        console.log(SKIP_MESSAGE);

        return {
            skipped: true,
            failed: false,
            deletedCount: 0,
            execution
        };

    }

    isRunning = true;

    try {

        const resultado =
            await cleanupExpiredAdminSessions();

        const deletedCount =
            resultado.deletedCount;

        console.log(
            SUCCESS_MESSAGE + deletedCount
        );

        return {
            skipped: false,
            failed: false,
            deletedCount,
            execution
        };

    } catch (error) {

        /**
         * Log de texto FIJO, sin error.message.
         *
         * Un error de PostgreSQL puede traer query,
         * detail, hint y la posicion, que es fragmento de la
         * sentencia. Un mensaje fijo no puede filtrar nada y
         * el fallo se corrige igual mirando el servidor.
         */
        console.error(ERROR_MESSAGE);

        return {
            skipped: false,
            failed: true,
            deletedCount: 0,
            execution
        };

    } finally {

        /**
         * La bandera se restablece siempre, tambien cuando
         * el servicio lanza. Sin esto, un unico fallo
         * dejaria el job bloqueado para siempre y ninguna
         * pasada posterior volveria a ejecutarse.
         */
        isRunning = false;

    }

}

/**
 * Programa la limpieza y lanza la pasada inicial.
 *
 * NO es async y NO se espera. Se elige asi a proposito:
 * startServer la invoca entre la comprobacion de la base de
 * datos y app.listen, y hacerla esperar bloquearia el
 * arranque por el tiempo que tarde un DELETE. La pasada
 * inicial se dispara y su promesa queda capturada y
 * expuesta, de modo que:
 *
 * - Express no espera a la limpieza.
 * - No puede haber unhandledRejection, porque la promesa
 *   ya tiene su catch y runAdminSessionCleanup nunca
 *   rechaza.
 * - Si la pasada inicial falla, el cron YA quedo
 *   programado, porque se programa antes de lanzarla. El
 *   trabajo pendiente se recupera en la siguiente pasada.
 *
 * La pasada inicial sirve para eso: recuperar lo que quedo
 * sin limpiar tras un tiempo apagado, sin retrasar el
 * arranque por ello.
 *
 * @returns {object} control del job
 */
function startAdminSessionCleanupJob() {

    /**
     * Arranque idempotente: si ya hay una tarea vigente se
     * devuelve el mismo control en vez de programar una
     * segunda, que dejaria dos tareas limpiando.
     */
    if (scheduledTask !== null) {
        return controlDelJob;
    }

    scheduledTask =
        cron.schedule(
            CRON_EXPRESSION,
            () =>
                runAdminSessionCleanup(
                    EXECUTION_SCHEDULED
                )
        );

    /**
     * Programado antes de lanzar, para que un fallo de la
     * pasada inicial no deje el cron sin programar.
     */
    startupPromise =
        runAdminSessionCleanup(
            EXECUTION_STARTUP
        );

    /**
     * Cinturon y tirantes. runAdminSessionCleanup no
     * rechaza, pero el catch evita que un cambio futuro en
     * esa funcion convierta esto en un unhandledRejection.
     */
    startupPromise.catch(() => {});

    return controlDelJob;

}

/**
 * Detiene el cron.
 *
 * Se expone para que las pruebas no dejen tareas ni timers
 * vivos, y para poder detener el mantenimiento de forma
 * controlada.
 *
 * Se hace stop() y luego destroy(). No es redundancia: en
 * node-cron 4 stop() solo cambia el estado de la tarea a
 * stopped y la deja en el registro, mientras que destroy()
 * la retira del planificador. Sin destroy, un proceso que
 * hubiera detenido el job conservaria la entrada.
 */
function stopAdminSessionCleanupJob() {

    if (scheduledTask === null) {
        return false;
    }

    try {

        scheduledTask.stop();

        scheduledTask.destroy();

    } finally {

        scheduledTask = null;
        startupPromise = null;

    }

    return true;

}

/**
 * Objeto de control.
 *
 * Es un unico objeto a nivel de modulo, de modo que
 * arrancas y detienes siempre la misma tarea.
 */
const controlDelJob = {

    start: startAdminSessionCleanupJob,

    stop: stopAdminSessionCleanupJob,

    /**
     * Permite ejecutar una pasada bajo demanda, sin esperar
     * 15 minutos. Es lo que usan las pruebas de
     * integracion, sin arrancar cron.
     */
    runNow: runAdminSessionCleanup,

    /**
     * Promesa de la pasada inicial, o null si el job no
     * esta arrancado. Permite esperarla en las pruebas.
     */
    getStartupPromise: () => startupPromise,

    getStatus: () =>
        scheduledTask === null
            ? "detenido"
            : scheduledTask.getStatus(),

    isScheduled: () =>
        scheduledTask !== null,

    /**
     * Expresion y origenes se exponen para que las pruebas
     * puedan verificar el contrato sin hardcodearlo dos
     * veces. isRunning NO se exporta: la bandera es
     * deliberadamente privada.
     */
    CRON_EXPRESSION,
    EXECUTION_STARTUP,
    EXECUTION_SCHEDULED
};

module.exports = {
    startAdminSessionCleanupJob,
    runAdminSessionCleanup
};
