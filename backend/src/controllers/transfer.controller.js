const path = require("path");

const {
    createTransfer,
    getTransfer,
    failTransfer
} = require(
    "../services/file-transfer.service"
);
const {
    createCommand
} = require(
    "../services/command.service"
);

const {
    registerTransfer,
    setTransferTimeout,
    removeTransfer
} = require(
    "../services/transfer-stream-registry.service"
);

const serverService =
    require(
        "../services/server.service"
    );




async function createDownloadTransfer(
    req,
    res
) {
    try {
        const {
            filePath
        } = req.body;

        const fileName =
    filePath.includes("\\")
        ? path.win32.basename(filePath)
        : path.posix.basename(filePath);

        const transfer =
            await createTransfer(
                req.user.id,
                req.params.id,
                "DOWNLOAD",
                fileName,
                filePath
            );

        res.status(201).json({
            success: true,
            transferId:
                transfer.transfer_id,
            status:
                transfer.status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message:
                error.message
        });
    }
}


async function downloadTransfer(
    req,
    res
) {
    const transfer =
        req.transfer;

    let registered = false;

    try {
        res.setHeader(
            "Content-Type",
            "application/octet-stream"
        );

       const safeFileName =
    transfer.file_name
        .replace(/[\r\n"]/g, "_");

const encodedFileName =
    encodeURIComponent(
        transfer.file_name
    );

res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`
);

        res.setHeader(
            "Cache-Control",
            "no-store"
        );

        res.setHeader(
            "X-Content-Type-Options",
            "nosniff"
        );

        const wasRegistered =
            registerTransfer(
                transfer.transfer_id,
                res
            );

        if (!wasRegistered) {
            return res.status(409).json({
                success: false,
                message:
                    "Esta transferencia ya está siendo descargada"
            });
        }

        registered = true;

        /*
         * Si el cliente cierra la descarga,
         * eliminamos la referencia temporal.
         */
        res.on(
            "close",
            () => {
                removeTransfer(
                    transfer.transfer_id
                );
            }
        );

        /*
         * Este timeout espera únicamente que
         * el agente comience a enviar el stream.
         *
         * No limita la duración total
         * de la descarga.
         */
        const agentTimeout =
            setTimeout(
                async () => {
                    removeTransfer(
                        transfer.transfer_id
                    );

                    try {
                        await failTransfer(
                            transfer.transfer_id,
                            "El agente no inició el stream dentro del tiempo permitido"
                        );
                    } catch (databaseError) {
                        console.error(
                            "No se pudo marcar la transferencia como fallida:",
                            databaseError.message
                        );
                    }

                    if (!res.headersSent) {
                        res.removeHeader(
                            "Content-Disposition"
                        );

                        res.removeHeader(
                            "X-Content-Type-Options"
                        );

                        return res.status(504).json({
                            success: false,
                            message:
                                "El agente no respondió a tiempo"
                        });
                    }

                    if (!res.destroyed) {
                        res.destroy();
                    }
                },
                30000
            );

        const timeoutSaved =
            setTransferTimeout(
                transfer.transfer_id,
                agentTimeout
            );

        if (!timeoutSaved) {
            clearTimeout(
                agentTimeout
            );

            throw new Error(
                "No se pudo configurar el timeout de la transferencia"
            );
        }

        /*
         * La conexión del cliente ya está registrada
         * y el timeout ya está activo.
         *
         * Ahora sí se crea el comando del agente.
         */
        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    transfer.server_id
                );

        await createCommand(
            agent.id,
            "DOWNLOAD_STREAM",
            {
                transferId:
                    transfer.transfer_id,

                filePath:
                    transfer.file_path
            }
        );
    } catch (error) {
        if (registered) {
            removeTransfer(
                transfer.transfer_id
            );
        }

        try {
            await failTransfer(
                transfer.transfer_id,
                error.message
            );
        } catch (databaseError) {
            console.error(
                "No se pudo marcar la transferencia como fallida:",
                databaseError.message
            );
        }

        if (!res.headersSent) {
            res.removeHeader(
                "Content-Disposition"
            );

            res.removeHeader(
                "X-Content-Type-Options"
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message
            });
        }

        if (!res.destroyed) {
            res.destroy();
        }
    }
}

module.exports = {
    createDownloadTransfer,
    downloadTransfer
};
