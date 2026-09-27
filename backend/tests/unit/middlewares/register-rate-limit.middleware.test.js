/**
 * Pruebas del rate limiting del registro de agentes.
 *
 * No usan PostgreSQL ni Express: montan la app minima
 * necesaria con un manejador final que actua como
 * controlador. Cada caso crea su propia instancia del
 * limitador, con ventana y limite pequenos, de modo que
 * ningun caso comparte contadores con otro.
 */

const {
    test
} = require("node:test");

const assert =
    require("node:assert/strict");

const express =
    require("express");

const request =
    require("supertest");

const {
    createRegisterRateLimit,
    DEFAULT_WINDOW_MS,
    DEFAULT_LIMIT,
    TOO_MANY_REQUESTS
} = require(
    "../../../src/middlewares/" +
    "register-rate-limit.middleware"
);

const TEST_WINDOW_MS =
    60 * 1000;

const TEST_LIMIT =
    3;

function buildApp(options) {

    const app =
        express();

    app.use(
        express.json()
    );

    /**
     * No monta agente ni autenticacion. Si el limitador
     * dependiera de req.agent, este manejador jamas se
     * alcanzaria y las pruebas fallarian.
     */
    app.post(
        "/register",
        createRegisterRateLimit(
            options
        ),
        (req, res) => {
            res.status(201).json({
                success: true
            });
        }
    );

    return app;

}

test(
    "no depende de req.agent",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: TEST_LIMIT
            });

        const response =
            await request(app)
                .post("/register")
                .send({});

        assert.equal(
            response.status,
            201
        );

        assert.equal(
            response.body.success,
            true
        );

    }
);

test(
    "permite las solicitudes hasta el limite y rechaza la que lo excede",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: TEST_LIMIT
            });

        for (
            let intento = 1;
            intento <= TEST_LIMIT;
            intento += 1
        ) {

            const permitido =
                await request(app)
                    .post("/register")
                    .send({});

            assert.equal(
                permitido.status,
                201,
                `el intento ${intento} ` +
                "debe permitirse"
            );

        }

        const rechazado =
            await request(app)
                .post("/register")
                .send({});

        assert.equal(
            rechazado.status,
            429
        );

    }
);

test(
    "la respuesta 429 cumple el contrato exacto",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await request(app)
            .post("/register")
            .send({});

        const response =
            await request(app)
                .post("/register")
                .send({});

        assert.equal(
            response.status,
            429
        );

        assert.equal(
            response.body.success,
            false
        );

        assert.equal(
            response.body.message,
            TOO_MANY_REQUESTS
        );

        assert.equal(
            response.body.message,
            "Demasiados intentos de registro. " +
            "Intenta nuevamente más tarde."
        );

        /**
         * El cuerpo no debe filtrar cuanto queda ni
         * cuantos intentos se hicieron.
         */
        assert.equal(
            Object.keys(response.body).length,
            2
        );

    }
);

test(
    "incluye Retry-After y RateLimit, y no encabezados heredados",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await request(app)
            .post("/register")
            .send({});

        const response =
            await request(app)
                .post("/register")
                .send({});

        const cabeceras =
            response.headers;

        assert.ok(
            cabeceras["retry-after"],
            "debe incluir Retry-After"
        );

        const retryAfter =
            Number(
                cabeceras["retry-after"]
            );

        assert.ok(
            Number.isFinite(retryAfter)
                && retryAfter > 0,
            "Retry-After debe ser un numero " +
            "de segundos mayor que cero"
        );

        assert.ok(
            retryAfter <= 60,
            "Retry-After no puede superar la " +
            "ventana configurada"
        );

        assert.ok(
            cabeceras["ratelimit"],
            "debe incluir la familia RateLimit"
        );

        /**
         * draft-8 reparte los parametros: RateLimit lleva
         * el restante y el reinicio, RateLimit-Policy lleva
         * la cuota y la ventana. RateLimit-Limit y
         * RateLimit-Remaining son nombres de draft-7 y no
         * deben aparecer.
         */
        assert.match(
            cabeceras["ratelimit"],
            /r=\d+/
        );

        assert.match(
            cabeceras["ratelimit"],
            /t=\d+/
        );

        assert.ok(
            cabeceras["ratelimit-policy"],
            "debe incluir RateLimit-Policy"
        );

        assert.match(
            cabeceras["ratelimit-policy"],
            /q=1\b/
        );

        assert.match(
            cabeceras["ratelimit-policy"],
            /w=60\b/
        );

        assert.equal(
            cabeceras["ratelimit-limit"],
            undefined,
            "no debe usar el nombre de draft-7 " +
            "RateLimit-Limit"
        );

        assert.equal(
            cabeceras["ratelimit-remaining"],
            undefined,
            "no debe usar el nombre de draft-7 " +
            "RateLimit-Remaining"
        );

        assert.equal(
            cabeceras["x-ratelimit-limit"],
            undefined,
            "no debe incluir X-RateLimit-Limit"
        );

        assert.equal(
            cabeceras["x-ratelimit-remaining"],
            undefined,
            "no debe incluir X-RateLimit-Remaining"
        );

        assert.equal(
            cabeceras["x-ratelimit-reset"],
            undefined,
            "no debe incluir X-RateLimit-Reset"
        );

    }
);

test(
    "permite configurar windowMs y limit",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        const primero =
            await request(app)
                .post("/register")
                .send({});

        assert.equal(
            primero.status,
            201
        );

        const segundo =
            await request(app)
                .post("/register")
                .send({});

        assert.equal(
            segundo.status,
            429
        );

        const appConOtroLimite =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 5
            });

        for (
            let intento = 0;
            intento < 5;
            intento += 1
        ) {

            const respuesta =
                await request(appConOtroLimite)
                    .post("/register")
                    .send({});

            assert.equal(
                respuesta.status,
                201
            );

        }

        const excedente =
            await request(appConOtroLimite)
                .post("/register")
                .send({});

        assert.equal(
            excedente.status,
            429
        );

    }
);

test(
    "no hay estado compartido entre instancias",
    async () => {

        const appA =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await request(appA)
            .post("/register")
            .send({});

        const agotada =
            await request(appA)
                .post("/register")
                .send({});

        assert.equal(
            agotada.status,
            429
        );

        /**
         * Una instancia nueva debe empezar con el contador
         * a cero aunque otra ya se haya agotado.
         */
        const appB =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        const fresca =
            await request(appB)
                .post("/register")
                .send({});

        assert.equal(
            fresca.status,
            201,
            "una instancia nueva no debe " +
            "heredar contadores"
        );

    }
);

test(
    "los valores de produccion son 10 intentos cada 15 minutos",
    () => {

        assert.equal(
            DEFAULT_LIMIT,
            10
        );

        assert.equal(
            DEFAULT_WINDOW_MS,
            15 * 60 * 1000
        );

    }
);
