/**
 * Pruebas HTTP del rate limiting en POST /api/agent/register.
 *
 * No importan src/app.js a proposito: app.js monta doce
 * routers y arrastraria configuracion que aqui no importa.
 * Se monta un router aislado que replica el orden real de
 * middlewares de la ruta, un controlador stub y sin
 * PostgreSQL en ningun punto.
 *
 * El orden bajo prueba es el de src/routes/agent.routes.js:
 *
 *   registerRateLimit, validate(registerSchema), registerAgent
 *
 * El limitador va antes de la validacion para que un
 * payload invalido tambien consuma intento.
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
    createRegisterRateLimit
} = require(
    "../../src/middlewares/" +
    "register-rate-limit.middleware"
);

const {
    validate
} = require(
    "../../src/middlewares/" +
    "validation.middleware"
);

const {
    registerSchema
} = require(
    "../../src/validators/register.validator"
);

const {
    TOO_MANY_REQUESTS
} = require(
    "../../src/middlewares/" +
    "register-rate-limit.middleware"
);

const TEST_WINDOW_MS =
    60 * 1000;

const TEST_LIMIT =
    2;

/**
 * Registro de las llamadas que llegan al controlador, para
 * comprobar que el limitador corta antes y que las rutas
 * distintas no se ven afectadas.
 */
function buildApp(options) {

    const app =
        express();

    const reached = [];

    app.use(
        express.json()
    );

    app.post(
        "/register",
        createRegisterRateLimit(
            options
        ),
        validate(registerSchema),
        (req, res) => {
            reached.push(
                req.body
            );
            res.status(201).json({
                success: true
            });
        }
    );

    /**
     * Ruta no limitada: debe quedar fuera del alcance del
     * limitador del registro.
     */
    app.post(
        "/otra",
        (_req, res) => {
            reached.push(
                { otra: true }
            );
            res.status(201).json({
                success: true
            });
        }
    );

    app.locals.reached =
        reached;

    return app;

}

const PAYLOAD_VALIDO = {
    registrationKey:
        "SHUB-TEST-DUMMY-KEY",
    version: "1.0.0",
    hostname: "host-prueba",
    operatingSystem: "linux",
    architecture: "x64"
};

test(
    "los primeros intentos llegan al siguiente middleware",
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

            const response =
                await request(app)
                    .post("/register")
                    .send(
                        PAYLOAD_VALIDO
                    );

            assert.equal(
                response.status,
                201
            );

        }

        assert.equal(
            app.locals.reached.length,
            TEST_LIMIT
        );

    }
);

test(
    "el intento que supera el limite devuelve 429 con el contrato exacto",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: TEST_LIMIT
            });

        for (
            let intento = 0;
            intento < TEST_LIMIT;
            intento += 1
        ) {

            await request(app)
                .post("/register")
                .send(
                    PAYLOAD_VALIDO
                );

        }

        const response =
            await request(app)
                .post("/register")
                .send(
                    PAYLOAD_VALIDO
                );

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

        /**
         * El limitador corta antes del controlador, asi
         * que el numero de llamadas no crece.
         */
        assert.equal(
            app.locals.reached.length,
            TEST_LIMIT
        );

    }
);

test(
    "el 429 incluye Retry-After y RateLimit",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await request(app)
            .post("/register")
            .send(
                PAYLOAD_VALIDO
            );

        const response =
            await request(app)
                .post("/register")
                .send(
                    PAYLOAD_VALIDO
                );

        assert.equal(
            response.status,
            429
        );

        const retryAfter =
            Number(
                response.headers["retry-after"]
            );

        assert.ok(
            Number.isFinite(retryAfter)
                && retryAfter > 0
                && retryAfter <= 60
        );

        assert.ok(
            response.headers["ratelimit"]
        );

        assert.ok(
            response.headers["ratelimit-policy"]
        );

        assert.equal(
            response.headers["x-ratelimit-limit"],
            undefined
        );

    }
);

test(
    "los payloads invalidos tambien consumen intentos",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 2
            });

        /**
         * El limitador va antes de validate, asi que un
         * payload invalido cuenta igual que uno valido.
         */
        for (
            let intento = 0;
            intento < 2;
            intento += 1
        ) {

            const invalido =
                await request(app)
                    .post("/register")
                    .send({
                        registrationKey: 123
                    });

            assert.equal(
                invalido.status,
                400,
                "la validacion debe rechazar el payload"
            );

        }

        const excedido =
            await request(app)
                .post("/register")
                .send(
                    PAYLOAD_VALIDO
                );

        assert.equal(
            excedido.status,
            429,
            "el tercer intento debe quedar limitado"
        );

        assert.equal(
            app.locals.reached.length,
            0,
            "ningun payload debe haber llegado " +
            "al controlador"
        );

    }
);

test(
    "otra ruta no queda limitada",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await request(app)
            .post("/register")
            .send(
                PAYLOAD_VALIDO
            );

        await request(app)
            .post("/register")
            .send(
                PAYLOAD_VALIDO
            );

        const otra =
            await request(app)
                .post("/otra")
                .send({});

        assert.equal(
            otra.status,
            201,
            "otra ruta no debe verse afectada"
        );

        assert.equal(
            otra.headers["retry-after"],
            undefined
        );

        assert.equal(
            otra.headers["ratelimit"],
            undefined
        );

    }
);

test(
    "el 429 no revela el estado de la clave",
    async () => {

        /**
         * Tres payloads con claves de formas distintas que
         * el servicio trataria de forma diferente, pero que
         * el limitador corta antes de llegar a el.
         */
        const payloads = [
            {
                registrationKey:
                    "SHUB-INEXISTENTE"
            },
            {
                registrationKey:
                    "SHUB-YA-USADA"
            },
            {
                registrationKey:
                    "SHUB-EXPIRADA"
            }
        ];

        const respuestas = [];

        for (
            const payload of payloads
        ) {

            const app =
                buildApp({
                    windowMs: TEST_WINDOW_MS,
                    limit: 1
                });

            await request(app)
                .post("/register")
                .send(
                    PAYLOAD_VALIDO
                );

            const respuesta =
                await request(app)
                    .post("/register")
                    .send(payload);

            assert.equal(
                respuesta.status,
                429
            );

            respuestas.push({
                body: respuesta.body,
                retryAfter:
                    respuesta.headers["retry-after"]
            });

        }

        const primero =
            JSON.stringify(
                respuestas[0]
            );

        for (
            const respuesta of respuestas
        ) {

            assert.equal(
                JSON.stringify(respuesta),
                primero,
                "las respuestas deben ser identicas"
            );

        }

        const cuerpo =
            respuestas[0].body;

        for (
            const clave of Object.keys(cuerpo)
        ) {

            assert.notEqual(
                clave,
                "registrationKey"
            );

        }

    }
);

test(
    "no hay estado compartido entre pruebas",
    async () => {

        const primera =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await request(primera)
            .post("/register")
            .send(
                PAYLOAD_VALIDO
            );

        const agotada =
            await request(primera)
                .post("/register")
                .send(
                    PAYLOAD_VALIDO
                );

        assert.equal(
            agotada.status,
            429
        );

        const segunda =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        const fresca =
            await request(segunda)
                .post("/register")
                .send(
                    PAYLOAD_VALIDO
                );

        assert.equal(
            fresca.status,
            201,
            "una instancia nueva no debe heredar " +
            "el contador de otra"
        );

    }
);
