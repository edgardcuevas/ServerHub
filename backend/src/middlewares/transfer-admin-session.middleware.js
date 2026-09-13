const {
    getTransfer
} = require(
    "../services/file-transfer.service"
);

const {
    validateAdminSession
} = require(
    "../services/admin-session.service"
);

async function requireTransferAdminSession(
    req,
    res,
    next
) {
    try {

        const token =
            req.headers[
                "x-admin-session"
            ];

        if (!token) {
            return res.status(401).json({
                success: false,
                message:
                    "Sesión administrativa requerida"
            });
        }

        const transfer =
            await getTransfer(
                req.params.transferId
            );

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message:
                    "Transferencia no encontrada"
            });
        }

        const session =
            await validateAdminSession(
                req.user.id,
                transfer.server_id,
                token
            );

        if (!session) {
            return res.status(401).json({
                success: false,
                message:
                    "Sesión administrativa inválida o expirada"
            });
        }

        req.transfer =
            transfer;

        req.adminSession =
            session;

        next();

    } catch (error) {

        res.status(500).json({
            success: false,
            message:
                error.message
        });

    }
}

module.exports = {
    requireTransferAdminSession
};