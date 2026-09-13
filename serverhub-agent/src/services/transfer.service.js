const fs = require("fs");
const axios = require("axios");

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

module.exports = {
    streamDownload
};