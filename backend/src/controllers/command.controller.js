const commandService =
    require("../services/command.service");

const pool =
    require("../config/db");


const {
    getUploadResponse,
    removeUpload
} = require(
    "../services/upload-stream-registry.service"
);

async function getPendingCommand(
    req,
    res
) {

    try {

        const command =
            await commandService
                .getPendingCommand(
                    req.agent.id
                );

        res.json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function completeCommand(
    req,
    res
) {

    try {

        const command =
            await commandService
                .completeCommand(
                    req.body.commandId,
                    req.body.result,
                    req.body.status ||
                        "COMPLETED"
                );

        if (
            command &&
            command.command_type ===
                "UPLOAD_STREAM"
        ) {

            const transferId =
                command.payload
                    ?.transferId;

            if (transferId) {

                const uploadResponse =
                    getUploadResponse(
                        transferId
                    );

                if (
                    uploadResponse &&
                    !uploadResponse.writableEnded &&
                    !uploadResponse.destroyed
                ) {

                    removeUpload(
                        transferId
                    );

                    if (
                        command.status ===
                            "COMPLETED"
                    ) {

                        uploadResponse
                            .status(200)
                            .json({
                                success: true,
                                message:
                                    "Archivo subido correctamente",
                                transferId,
                                bytesWritten:
                                    command.result
                                        ?.bytesWritten ??
                                    null
                            });

                    } else {

                        uploadResponse
                            .status(500)
                            .json({
                                success: false,
                                message:
                                    command.result
                                        ?.message ||
                                    "El agente no pudo completar la subida",
                                transferId
                            });

                    }

                } else {

                    removeUpload(
                        transferId
                    );

                }

            }

        }

        return res.json({
            success: true,
            command
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

}


async function downloadCommandFile(
    req,
    res
) {

    try {

        const result =
            await pool.query(
                `
                SELECT ac.result
                FROM agent_commands ac
                JOIN agents a ON a.id = ac.agent_id
                JOIN servers s ON s.id = a.server_id
                WHERE ac.id = $1
                AND ac.status = 'COMPLETED'
                AND s.user_id = $2
                `,
                [req.params.id, req.user.id]
            );

        const command =
            result.rows[0];

        if (
            !command ||
            !command.result
        ) {

            return res.status(404).json({
                success: false,
                message:
                    "Archivo no encontrado"
            });

        }

        const {
            fileName,
            content
        } = command.result;

        const buffer =
            Buffer.from(
                content,
                "base64"
            );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
        );

        res.send(buffer);

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function getPendingCommands(
    req,
    res
) {

    try {

        const commands =
            await commandService
                .getPendingCommands(
                    req.agent.id
                );

        res.json({
            success: true,
            commands
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}
module.exports = {
    getPendingCommand,
    completeCommand,
    downloadCommandFile,
    getPendingCommands
};