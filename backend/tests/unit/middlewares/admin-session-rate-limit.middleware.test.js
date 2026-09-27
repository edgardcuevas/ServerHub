/**
 * Pruebas del rate limiting del desbloqueo administrativo.
 *
 * No usan PostgreSQL ni Express salvo supertest para la
 * mayoria de los casos. El caso de IPs distintas invoca
 * el middleware directamente con un req fabricated, porque
 * simular req.ip a traves de cabeceras seria mentir sobre
 * lo que hace Express: req.ip depende de trust proxy, que
 * aqui no esta configurado y no debe estarlo.
 *
 * Cada caso crea su propia instancia del limitador para no
 * compartir contadores.
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
    createAdminSessionRateLimit,
    DEFAULT_WINDOW_MS,
    DEFAULT_LIMIT,
    TOO_MANY_REQUESTS
} = require(
    "../../../src/middlewares/" +
    "admin-session-rate-limit.middleware"
);

const TEST_WINDOW_MS =
    60 * 1000;

const USER_ID =
    42;

const SERVER_ID =
    7;

/**
 * Invocacion directa, para poder fijar req.ip sin tocar
 * cabeceras.
 *
 * El middleware es asincrono, de modo que la promesa se
 * resuelve en next() o en la respuesta, lo que ocurra
 * primero. Comprobar si no se escribio nada de forma
 * sincrona dariia un falso negativo.
 *
 * La respuesta falsa necesita append ademas de
 * setHeader: draft-8 escribe RateLimit y RateLimit-Policy
 * con valores multiples y usa ese metodo de Node. Sin el,
 * el fallo se enruta a next(error) y la peticion
 * pareceria permitida cuando en realidad no llego a
 * contabilizarse.
 */
function invoke(
    middleware,
    {
        userId = USER_ID,
        serverId = SERVER_ID,
        ip = "203.0.113.9"
    } = {}
) {

    const req = {
        ip,
        user:
            userId === null
                ? undefined
                : { id: userId },
        params:
            serverId === null
                ? {}
                : { id: serverId },
        headers: {}
    };

    const state = {
        statusCode: null,
        body: null,
        headers: {}
    };

    let nexted = false;
    let error = null;
    let settle;

    const done =
        new Promise(
            resolve => {
                settle = resolve;
            }
        );

    const finish = () => {

        if (
            !settle
        ) {
            return;
        }

        const resolver = settle;
        settle = null;

        resolver({
            nexted,
            error,
            state
        });

    };

    const res = {
        headersSent: false,

        status(code) {
            state.statusCode = code;
            return this;
        },

        json(body) {
            state.body = body;
            this.headersSent = true;
            finish();
            return this;
        },

        send(body) {
            state.body = body;
            this.headersSent = true;
            finish();
            return this;
        },

        setHeader(name, value) {
            state.headers[
                name.toLowerCase()
            ] = value;
        },

        append(name, value) {
            const clave =
                name.toLowerCase();

            const previo =
                state.headers[clave];

            state.headers[clave] =
                previo === undefined
                    ? value
                    : [].concat(
                        previo,
                        value
                    );
        },

        getHeader(name) {
            return state.headers[
                name.toLowerCase()
            ];
        },

        removeHeader(name) {
            delete state.headers[
                name.toLowerCase()
            ];
        }
    };

    middleware(
        req,
        res,
        err => {
            /**
             * next(error) significa que el middleware
             * fallo. No cuenta como peticion permitida.
             */
            error =
                err
                    ? err.message
                    : null;

            nexted =
                error === null;

            finish();
        }
    );

    return done;

}

function buildApp(options) {

    const app =
        express();

    app.use(
        express.json()
    );

    app.post(
        "/api/server/:id/admin-session",
        (req, _res, next) => {
            req.user = {
                id: Number(
                    req.headers["x-test-user-id"]
                )
            };
            next();
        },
        createAdminSessionRateLimit(
            options
        ),
        (_req, res) => {
            res.status(201).json({
                success: true
            });
        }
    );

    return app;

}

test(
    "1. permite 10 intentos y el 11 devuelve 429",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: DEFAULT_LIMIT
            });

        for (
            let intento = 1;
            intento <= DEFAULT_LIMIT;
            intento += 1
        ) {

            const resultado =
                await invoke(middleware);

            assert.equal(
                resultado.nexted,
                true,
                `el intento ${intento} ` +
                "debe permitirse"
            );

        }

        const excedido =
            await invoke(middleware);

        assert.equal(
            excedido.nexted,
            false
        );

        assert.equal(
            excedido.state.statusCode,
            429
        );

    }
);

test(
    "2. la configuracion reducida funciona sin esperar 15 minutos",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 2
            });

        assert.equal(
            (
                await invoke(middleware)
            ).nexted,
            true
        );

        assert.equal(
            (
                await invoke(middleware)
            ).nexted,
            true
        );

        const tercero =
            await invoke(middleware);

        assert.equal(
            tercero.nexted,
            false
        );

        assert.equal(
            tercero.state.body.success,
            false
        );

        assert.equal(
            tercero.state.body.message,
            TOO_MANY_REQUESTS
        );

        assert.equal(
            TOO_MANY_REQUESTS,
            "Demasiados intentos de desbloqueo " +
            "administrativo. Intenta nuevamente " +
            "más tarde."
        );

    }
);

test(
    "3. incluye Retry-After, RateLimit y RateLimit-Policy, y no X-RateLimit",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await invoke(middleware);

        const excedido =
            await invoke(middleware);

        const cabeceras =
            excedido.state.headers;

        const retryAfter =
            Number(
                cabeceras["retry-after"]
            );

        assert.ok(
            Number.isFinite(retryAfter)
                && retryAfter > 0
                && retryAfter <= 60
        );

        assert.ok(
            cabeceras["ratelimit"]
        );

        assert.match(
            cabeceras["ratelimit"],
            /r=\d+/
        );

        assert.ok(
            cabeceras["ratelimit-policy"]
        );

        assert.match(
            cabeceras["ratelimit-policy"],
            /q=1\b/
        );

        assert.equal(
            cabeceras["x-ratelimit-limit"],
            undefined
        );

        assert.equal(
            cabeceras["x-ratelimit-remaining"],
            undefined
        );

        assert.equal(
            cabeceras["x-ratelimit-reset"],
            undefined
        );

    }
);

test(
    "4. la clave no depende de contrasena ni de token de sesion",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        const primero =
            await request(app)
                .post(
                    `/api/server/${SERVER_ID}` +
                    "/admin-session"
                )
                .set(
                    "x-test-user-id",
                    String(USER_ID)
                )
                .send({
                    password:
                        "una contraseña"
                });

        assert.equal(
            primero.status,
            201
        );

        /**
         * Mismo usuario, mismo servidor, misma IP, pero
         * credenciales distintas. La cuota ya esta agotada,
         * lo que demuestra que esas credenciales no forman
         * parte de la clave.
         */
        const segundo =
            await request(app)
                .post(
                    `/api/server/${SERVER_ID}` +
                    "/admin-session"
                )
                .set(
                    "x-test-user-id",
                    String(USER_ID)
                )
                .send({
                    password:
                        "otra contraseña",
                    token: "otro token",
                    xAdminSession: "otro"
                });

        assert.equal(
            segundo.status,
            429
        );

    }
);

test(
    "5. distintos userId tienen contadores independientes",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        assert.equal(
            (
                await invoke(middleware, {
                    userId: 1
                })
            ).nexted,
            true
        );

        const ajeno =
            await invoke(middleware, {
                userId: 2
            });

        assert.equal(
            ajeno.nexted,
            true,
            "otro usuario no hereda la cuota"
        );

        const bloqueado =
            await invoke(middleware, {
                userId: 1
            });

        assert.equal(
            bloqueado.nexted,
            false
        );

    }
);

test(
    "6. distintos serverId tienen contadores independientes",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        assert.equal(
            (
                await invoke(middleware, {
                    serverId: 100
                })
            ).nexted,
            true
        );

        const otroServidor =
            await invoke(middleware, {
                serverId: 200
            });

        assert.equal(
            otroServidor.nexted,
            true,
            "otro servidor no hereda la cuota"
        );

        const bloqueado =
            await invoke(middleware, {
                serverId: 100
            });

        assert.equal(
            bloqueado.nexted,
            false
        );

    }
);

test(
    "7. distintas IP tienen contadores independientes",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        assert.equal(
            (
                await invoke(middleware, {
                    ip: "203.0.113.9"
                })
            ).nexted,
            true
        );

        const otraIp =
            await invoke(middleware, {
                ip: "198.51.100.7"
            });

        assert.equal(
            otraIp.nexted,
            true,
            "otra IP no hereda la cuota"
        );

        const bloqueada =
            await invoke(middleware, {
                ip: "203.0.113.9"
            });

        assert.equal(
            bloqueada.nexted,
            false
        );

        /**
         * El caso inverso: dos IPs distintas allows
         * agotar cuota de un mismo servidor y usuario, que
         * es exactamente lo que se pretendia evitar al
         * incluir la IP en la clave.
         */
        const segunda =
            await invoke(middleware, {
                ip: "198.51.100.8"
            });

        assert.equal(
            segunda.nexted,
            true
        );

    }
);

test(
    "8. IPv6 se agrupa por prefijo",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        assert.equal(
            (
                await invoke(middleware, {
                    ip:
                        "2001:db8:85a3::1"
                })
            ).nexted,
            true
        );

        /**
         * Mismo prefijo /56, direccion distinta: comparte
         * cuota, que es la proteccion frente a la
         * multiplicacion de cuota por IPv6.
         */
        const mismoPrefijo =
            await invoke(middleware, {
                ip:
                    "2001:db8:85a3::2"
            });

        assert.equal(
            mismoPrefijo.nexted,
            false
        );

    }
);

test(
    "9. la ausencia de user no produce TypeError",
    async () => {

        const middleware =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 5
            });

        const resultado =
            await invoke(middleware, {
                userId: null
            });

        assert.equal(
            resultado.nexted,
            true
        );

        const sinServidor =
            await invoke(middleware, {
                serverId: null
            });

        assert.equal(
            sinServidor.nexted,
            true
        );

    }
);

test(
    "10. no hay estado compartido entre instancias",
    async () => {

        const primera =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        assert.equal(
            (
                await invoke(primera)
            ).nexted,
            true
        );

        assert.equal(
            (
                await invoke(primera)
            ).nexted,
            false
        );

        const segunda =
            createAdminSessionRateLimit({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        assert.equal(
            (
                await invoke(segunda)
            ).nexted,
            true,
            "una instancia nueva no hereda contadores"
        );

    }
);

test(
    "11. los valores de produccion son 10 intentos cada 15 minutos",
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
