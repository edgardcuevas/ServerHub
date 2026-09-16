const fs = require("fs");
const axios = require("axios");

const {
    pipeline
} = require(
    "stream/promises"
);

const config =
    require("../config/config.json");

const {
    loadCredentials
} = require(
    "./credentials.service"
);

async function streamDownload(
    transferId,
    filePath
) {

    return new Promise(
        async (
            resolve,
            reject
        ) => {

            try {

                const stream =
                    fs.createReadStream(
                        filePath
                    );

                const credentials =
                    loadCredentials();

                const response =
                    await axios.post(
                        `${config.apiUrl}/api/transfers/stream/${transferId}`,
                        stream,
                        {
                            headers: {
                                "Content-Type":
                                    "application/octet-stream",

                                "X-Agent-Token":
                                    credentials.agentToken
                            },
                            maxBodyLength:
                                Infinity,
                            maxContentLength:
                                Infinity
                        }
                    );

                resolve({
                    success: true,
                    transferId
                });

            } catch (error) {

                reject(error);

            }

        }
    );

}

async function streamUpload(
    transferId,
    filePath
) {

    if (
        !transferId ||
        typeof transferId !== "string"
    ) {
        throw new Error(
            "Transfer ID requerido"
        );
    }

    if (
        !filePath ||
        typeof filePath !== "string"
    ) {
        throw new Error(
            "Ruta de destino requerida"
        );
    }

    const credentials =
        loadCredentials();

    if (
        !credentials.agentToken
    ) {
        throw new Error(
            "Agent Token no disponible"
        );
    }

    const response =
        await axios.post(
            `${config.apiUrl}/api/transfers/upload-stream/${transferId}`,
            null,
            {
                headers: {
                    "X-Agent-Token":
                        credentials.agentToken,

                    "Accept":
                        "application/octet-stream"
                },

                responseType:
                    "stream",

                timeout:
                    0,

                maxBodyLength:
                    Infinity,

                maxContentLength:
                    Infinity,

                decompress:
                    false
            }
        );

    const fileStream =
        fs.createWriteStream(
            filePath
        );

    try {

        await pipeline(
            response.data,
            fileStream
        );

    } catch (error) {

        if (
            response.data &&
            !response.data.destroyed
        ) {
            response.data.destroy(
                error
            );
        }

        if (
            !fileStream.destroyed
        ) {
            fileStream.destroy(
                error
            );
        }

        throw error;
    }

    return {
        success: true,
        transferId,
        filePath,
        bytesWritten:
            fileStream.bytesWritten
    };
}

module.exports = {
    streamDownload,
    streamUpload
};