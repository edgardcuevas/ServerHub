const {
    pipeline
} = require(
    "stream/promises"
);

const {
    getUploadRequest,
    removeUpload,
    markUploadStarted
} = require(
    "../services/upload-stream-registry.service"
);

async function receiveUploadStream(
    req,
    res
) {
    const {
        transferId
    } = req.params;

    try {
        const uploadRequest =
            getUploadRequest(
                transferId
            );

        if (!uploadRequest) {
            return res.status(404).json({
                success: false,
                message:
                    "Transferencia no encontrada"
            });
        }

        const started =
            markUploadStarted(
                transferId
            );

        if (!started) {
            return res.status(409).json({
                success: false,
                message:
                    "La transferencia ya está siendo procesada"
            });
        }

        res.status(200);

        res.setHeader(
            "Content-Type",
            uploadRequest.headers[
                "content-type"
            ] ||
            "application/octet-stream"
        );

        const contentLength =
            uploadRequest.headers[
                "content-length"
            ];

        if (contentLength) {
            res.setHeader(
                "Content-Length",
                contentLength
            );
        }

        res.setHeader(
            "Cache-Control",
            "no-store"
        );

        await pipeline(
    uploadRequest,
    res
);
    } catch (error) {
        removeUpload(
            transferId
        );

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message:
                    "No se pudo transmitir el archivo"
            });
        }

        if (!res.destroyed) {
            res.destroy(
                error
            );
        }
    }
}

module.exports = {
    receiveUploadStream
};