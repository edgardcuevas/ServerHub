const crypto =
    require(
        "crypto"
    );

function generateRegistrationKey() {

    const randomPart =
        crypto
            .randomBytes(16)
            .toString("hex")
            .toUpperCase();

    return `SHUB-${randomPart}`;

}

module.exports = {
    generateRegistrationKey
};
``