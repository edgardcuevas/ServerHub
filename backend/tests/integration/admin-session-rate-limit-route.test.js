/**
 * Rate limiting del desbloqueo administrativo por HTTP.
 *
 * Monta un router aislado con el limitador real y un
 * controlador stub. No importa src/app.js ni el controlador
 * real, y no conecta PostgreSQL en ningun punto: lo que se
 * comprueba es el orden de los middlewares, la composicion
 * de la clave y el contrato de la respuesta.
 *
 * No se habilita trust proxy y no se usan cabeceras
 * X-Forwarded-For para simular IPs, de modo que req.ip es
 * siempre la direccion del socket. En estas pruebas todas
 * las peticiones comparten IP, y a proposito: la
 * independencia de IP se comprueba en las pruebas
 * unitarias, invocando el middleware con req.ip fijado.
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
    TOO_MANY_REQUESTS
} = require(
    "../../src/middlewares/" +
    "admin-session-rate-limit.middleware"
);

const TEST_WINDOW_MS =
    60 * 1000;

const TEST_LIMIT =
    2;

const USER_ID =
    42;

const SERVER_ID =
    7;

/**
 * Controlador stub. Decide la respuesta a partir de la
 * contrasena, para comprobar que el limitador es previo y
 * que su 429 no revela nada del resultado.
 */
function buildStubController() {

    const reached = [];

    const controller =
        (req, res) => {

            reached.push({
                id: req.params.id,
                user: req.user.id,
                body: req.body
            });

            if (
                req.body.password ===
                "correcta"
            ) {

                return res.status(200).json({
                    success: true,
                    token:
                        "token-de-sesion"
                });

            }

            return res.status(401).json({
                success: false,
                message:
                    "Contraseña administrativa incorrecta"
            });

        };

    return { controller, reached };

}

/**
 * Middleware de autenticacion de prueba. Reproduce el
 * efecto de authenticate sin cargar JWT: si no llega id,
 * responde 401 y NO llama a next, que es justo lo que
 * impide que una peticion sin credenciales llegue al
 * limitador.
 */
function fakeAuthenticate(
    req,
    res,
    next
) {

    const id =
        req.headers["x-test-user-id"];

    if (
        typeof id !== "string" ||
        !/^\d+$/.test(id)
    ) {

        return res.status(401).json({
            success: false,
            message:
                "Token requerido"
        });

    }

    req.user =
        { id: Number(id) };

    next();

}

function buildApp(options) {

    const app =
        express();

    app.use(
        express.json()
    );

    const {
        controller,
        reached
    } = buildStubController();

    app.post(
        "/api/server/:id/admin-session",
        fakeAuthenticate,
        createAdminSessionRateLimit(
            options ?? {
                windowMs: TEST_WINDOW_MS,
                limit: TEST_LIMIT
            }
        ),
        controller
    );

    /**
     * Ruta de logout, sin limitador, tal como queda en
     * produccion.
     */
    app.post(
        "/api/server/:id/admin-session/logout",
        fakeAuthenticate,
        (req, res) => {
            reached.push({
                logout: true,
                id: req.params.id,
                user: req.user.id
            });
            res.json({ success: true });
        }
    );

    app.locals.reached =
        reached;

    return app;

}

function postRegister(
    app,
    {
        userId = USER_ID,
        serverId = SERVER_ID,
        password = "correcta",
        includeUser = true
    } = {}
) {

    let peticion =
        request(app)
            .post(
                `/api/server/${serverId}` +
                "/admin-session"
            );

    if (includeUser) {
        peticion = peticion.set(
            "x-test-user-id",
            String(userId)
        );
    }

    return peticion.send(
        password === null
            ? {}
            : { password }
    );

}

test(
    "1. una solicitud sin autenticación no llega al limitador",
    async () => {

        const app =
            buildApp();

        const response =
            await postRegister(app, {
                includeUser: false
            });

        assert.equal(
            response.status,
            401
        );

        assert.equal(
            app.locals.reached.length,
            0
        );

        assert.equal(
            response.headers["retry-after"],
            undefined
        );

        /**
         * Aunque no le haya llegado, la cuota sigue
         * intacta para el usuario que sí se autentique.
         */
        for (
            let intento = 0;
            intento < TEST_LIMIT;
            intento += 1
        ) {

            const valida =
                await postRegister(app);

            assert.equal(
                valida.status,
                200,
                "la cuota del usuario no debe " +
                "gastarse por peticiones ajenas"
            );

        }

    }
);

test(
    "2. los primeros intentos llegan al controlador y el excedente da 429",
    async () => {

        const app =
            buildApp();

        for (
            let intento = 1;
            intento <= TEST_LIMIT;
            intento += 1
        ) {

            const respuesta =
                await postRegister(app);

            assert.equal(
                respuesta.status,
                200,
                `el intento ${intento} ` +
                "debe llegar al controlador"
            );

        }

        const excedido =
            await postRegister(app);

        assert.equal(
            excedido.status,
            429
        );

        assert.equal(
            app.locals.reached.length,
            TEST_LIMIT,
            "el 429 ocurre antes del controlador"
        );

    }
);

test(
    "3. la respuesta 429 cumple el contrato exacto",
    async () => {

        const app =
            buildApp();

        for (
            let intento = 0;
            intento < TEST_LIMIT;
            intento += 1
        ) {

            await postRegister(app);

        }

        const respuesta =
            await postRegister(app);

        assert.equal(
            respuesta.status,
            429
        );

        assert.equal(
            respuesta.body.success,
            false
        );

        assert.equal(
            respuesta.body.message,
            TOO_MANY_REQUESTS
        );

        assert.equal(
            respuesta.body.message,
            "Demasiados intentos de desbloqueo " +
            "administrativo. Intenta nuevamente " +
            "más tarde."
        );

        assert.equal(
            Object.keys(respuesta.body).length,
            2
        );

    }
);

test(
    "4. el 429 incluye Retry-After, RateLimit y RateLimit-Policy",
    async () => {

        const app =
            buildApp();

        await postRegister(app);
        await postRegister(app);

        const respuesta =
            await postRegister(app);

        assert.equal(
            respuesta.status,
            429
        );

        const retryAfter =
            Number(
                respuesta.headers["retry-after"]
            );

        assert.ok(
            Number.isFinite(retryAfter)
                && retryAfter > 0
                && retryAfter <= 60
        );

        assert.ok(
            respuesta.headers["ratelimit"]
        );

        assert.match(
            respuesta.headers["ratelimit"],
            /r=\d+/
        );

        assert.ok(
            respuesta.headers["ratelimit-policy"]
        );

        assert.match(
            respuesta.headers["ratelimit-policy"],
            new RegExp(
                `q=${TEST_LIMIT}\\b`
            )
        );

        assert.equal(
            respuesta.headers["x-ratelimit-limit"],
            undefined
        );

        assert.equal(
            respuesta.headers["x-ratelimit-remaining"],
            undefined
        );

    }
);

test(
    "5. una contraseña correcta también consume intento",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 2
            });

        const primera =
            await postRegister(app, {
                password: "correcta"
            });

        assert.equal(
            primera.status,
            200
        );

        const segunda =
            await postRegister(app, {
                password: "correcta"
            });

        assert.equal(
            segunda.status,
            200
        );

        const tercera =
            await postRegister(app, {
                password: "correcta"
            });

        assert.equal(
            tercera.status,
            429,
            "un desbloqueo correcto agotado " +
            "también limita"
        );

    }
);

test(
    "6. una contraseña incorrecta también consume intento",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 2
            });

        const primera =
            await postRegister(app, {
                password: "mala"
            });

        assert.equal(
            primera.status,
            401
        );

        await postRegister(app, {
            password: "mala"
        });

        const tercera =
            await postRegister(app, {
                password: "correcta"
            });

        assert.equal(
            tercera.status,
            429,
            "los intentos fallidos agotan la cuota"
        );

    }
);

test(
    "7. un payload vacío también consume intento",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 2
            });

        const primera =
            await postRegister(app, {
                password: null
            });

        assert.equal(
            primera.status,
            401
        );

        await postRegister(app, {
            password: null
        });

        const tercera =
            await postRegister(app, {
                password: "correcta"
            });

        assert.equal(
            tercera.status,
            429
        );

    }
);

test(
    "8. un usuario diferente conserva su propia cuota",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        const primera =
            await postRegister(app, {
                userId: 1
            });

        assert.equal(
            primera.status,
            200
        );

        const bloqueado =
            await postRegister(app, {
                userId: 1
            });

        assert.equal(
            bloqueado.status,
            429
        );

        const otroUsuario =
            await postRegister(app, {
                userId: 2
            });

        assert.equal(
            otroUsuario.status,
            200,
            "otro usuario no hereda la cuota"
        );

    }
);

test(
    "9. un servidor diferente conserva su propia cuota",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        const primera =
            await postRegister(app, {
                serverId: 100
            });

        assert.equal(
            primera.status,
            200
        );

        const bloqueado =
            await postRegister(app, {
                serverId: 100
            });

        assert.equal(
            bloqueado.status,
            429
        );

        const otroServidor =
            await postRegister(app, {
                serverId: 200
            });

        assert.equal(
            otroServidor.status,
            200,
            "otro servidor no hereda la cuota"
        );

    }
);

test(
    "10. la ruta de logout no queda limitada",
    async () => {

        const app =
            buildApp({
                windowMs: TEST_WINDOW_MS,
                limit: 1
            });

        await postRegister(app);
        await postRegister(app);

        assert.equal(
            (
                await postRegister(app)
            ).status,
            429
        );

        for (
            let intento = 0;
            intento < 5;
            intento += 1
        ) {

            const logout =
                await request(app)
                    .post(
                        `/api/server/${SERVER_ID}` +
                        "/admin-session/logout"
                    )
                    .set(
                        "x-test-user-id",
                        String(USER_ID)
                    )
                    .send({
                        token: "cualquiera"
                    });

            assert.equal(
                logout.status,
                200,
                "logout no debe quedar limitado"
            );

            assert.equal(
                logout.headers["retry-after"],
                undefined
            );

        }

    }
);

test(
    "11. el 429 no revela si la contraseña era correcta",
    async () => {

        const respuestas = [];

        for (
            const password of
            [
                "correcta",
                "mala",
                "otra"
            ]
        ) {

            const app =
                buildApp({
                    windowMs: TEST_WINDOW_MS,
                    limit: 1
                });

            await postRegister(app, {
                password
            });

            const excedido =
                await postRegister(app, {
                    password
                });

            assert.equal(
                excedido.status,
                429
            );

            respuestas.push({
                body: excedido.body,
                retryAfter:
                    excedido.headers["retry-after"]
            });

        }

        const referencia =
            JSON.stringify(
                respuestas[0]
            );

        for (
            const respuesta of respuestas
        ) {

            assert.equal(
                JSON.stringify(respuesta),
                referencia,
                "el 429 debe ser idéntico " +
                "haya acertado o no"
            );

        }

    }
);

test(
    "12. el 429 no revela el token de sesión",
    async () => {

        const app =
            buildApp();

        await postRegister(app);
        await postRegister(app);

        const excedido =
            await postRegister(app);

        const cuerpo =
            JSON.stringify(
                excedido.body
            );

        assert.ok(
            !cuerpo.includes(
                "token-de-sesion"
            )
        );

        assert.equal(
            excedido.body.token,
            undefined
        );

    }
);
