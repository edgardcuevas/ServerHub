const test =
    require("node:test");

const assert =
    require("node:assert/strict");

test(
    "la infraestructura de pruebas funciona",
    () => {

        assert.equal(
            1 + 1,
            2
        );

    }
);