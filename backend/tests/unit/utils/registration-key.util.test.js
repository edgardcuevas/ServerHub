const test =
    require(
        "node:test"
    );

const assert =
    require(
        "node:assert/strict"
    );

const {
    generateRegistrationKey
} = require(
    "../../../src/utils/registration-key.util"
);

test(
    "genera una clave de registro con 128 bits de entropía",
    () => {

        const registrationKey =
            generateRegistrationKey();

        assert.match(
            registrationKey,
            /^SHUB-[A-F0-9]{32}$/
        );

        assert.equal(
            registrationKey.length,
            37
        );

    }
);

test(
    "genera claves diferentes en llamadas sucesivas",
    () => {

        const generatedKeys =
            new Set();

        for (
            let index = 0;
            index < 100;
            index += 1
        ) {
            generatedKeys.add(
                generateRegistrationKey()
            );
        }

        assert.equal(
            generatedKeys.size,
            100
        );

    }
);