const { pipeline } = require("stream");
const { promisify } = require("util");

const pipelineAsync = promisify(
    pipeline
);

const {
    getTransferResponse,
    markStreamStarted,
    removeTransfer
} = require(
    "../services/transfer-stream-registry.service"
);

const {
    getTransfer,
    startTransfer,
    completeTransfer,
    failTransfer
} = require(
    "../services/file-transfer.service"
);

async function receiveStream(
    req,
    res
) {
    const transferId =
        req.params.transferId;

    let browserResponse = null;

    try {
        const transfer =
            await getTransfer(
                transferId
            );

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message:
                    "Transferencia no encontrada"
            });
        }


        if (
            String(
                transfer.server_id
            ) !==
            String(
                req.agent.server_id
            )
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "El agente no pertenece a esta transferencia"
            });
        }


        if (
            transfer.direction !==
            "DOWNLOAD"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "La transferencia no corresponde a una descarga"
            });
        }


        if (
            transfer.expires_at &&
            new Date(
                transfer.expires_at
            ).getTime() <= Date.now()
        ) {
            return res.status(410).json({
                success: false,
                message:
                    "Transferencia expirada"
            });
        }

        browserResponse =
            getTransferResponse(
                transferId
            );

        if (
            !browserResponse ||
            browserResponse.destroyed ||
            browserResponse.writableEnded
        ) {
            return res.status(410).json({
                success: false,
                message:
                    "El cliente de descarga ya no está conectado"
            });
        }

        const streamMarked =
    markStreamStarted(
        transferId
    );

if (!streamMarked) {
    return res.status(410).json({
        success: false,
        message:
            "La transferencia ya no está disponible"
    });
}

        await startTransfer(
            transferId
        );

        await pipelineAsync(
            req,
            browserResponse
        );


        await completeTransfer(
            transferId
        );


        removeTransfer(
            transferId
        );


        return res.status(200).json({
            success: true,
            transferId,
            status: "COMPLETED"
        });
    } catch (error) {
        removeTransfer(
            transferId
        );

        try {
            await failTransfer(
                transferId,
                error.message
            );
        } catch (databaseError) {
            console.error(
                "No se pudo marcar la transferencia como fallida:",
                databaseError.message
            );
        }


        if (
            browserResponse &&
            !browserResponse.destroyed
        ) {
            browserResponse.destroy();
        }


        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message:
                    "La transferencia fue interrumpida",
                error:
                    error.message
            });
        }

        return res.end();
    }
}

module.exports = {
    receiveStream
};