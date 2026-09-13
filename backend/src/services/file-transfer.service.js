const crypto = require("crypto");

const pool =
    require("../config/db");

async function createTransfer(
    userId,
    serverId,
    direction,
    fileName,
    filePath
) {

    const transferId =
        crypto.randomUUID();

    const expiresAt =
        new Date(
            Date.now() +
            (
                30 * 60 * 1000
            )
        );

    const result =
        await pool.query(
            `
            INSERT INTO file_transfers
            (
                transfer_id,
                server_id,
                user_id,
                direction,
                file_name,
                file_path,
                expires_at
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7
            )
            RETURNING *
            `,
            [
                transferId,
                serverId,
                userId,
                direction,
                fileName,
                filePath,
                expiresAt
            ]
        );

    return result.rows[0];

}

async function getTransfer(
    transferId
) {

    const result =
        await pool.query(
            `
            SELECT *
            FROM file_transfers
            WHERE transfer_id = $1
            `,
            [transferId]
        );

    return result.rows[0] || null;

}

async function startTransfer(
    transferId
) {

    await pool.query(
        `
        UPDATE file_transfers
        SET
            status = 'IN_PROGRESS',
            started_at = CURRENT_TIMESTAMP
        WHERE transfer_id = $1
        `,
        [transferId]
    );

}

async function completeTransfer(
    transferId
) {

    await pool.query(
        `
        UPDATE file_transfers
        SET
            status = 'COMPLETED',
            completed_at = CURRENT_TIMESTAMP
        WHERE transfer_id = $1
        `,
        [transferId]
    );

}

async function failTransfer(
    transferId,
    errorMessage
) {

    await pool.query(
        `
        UPDATE file_transfers
        SET
            status = 'FAILED',
            error_message = $2
        WHERE transfer_id = $1
        `,
        [
            transferId,
            errorMessage
        ]
    );

}

async function updateTransferProgress(
    transferId,
    bytesTransferred
) {

    await pool.query(
        `
        UPDATE file_transfers
        SET
            bytes_transferred = $2
        WHERE transfer_id = $1
        `,
        [
            transferId,
            bytesTransferred
        ]
    );

}

module.exports = {
    createTransfer,
    getTransfer,
    startTransfer,
    completeTransfer,
    failTransfer,
    updateTransferProgress
};