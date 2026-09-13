const activeTransfers =
    new Map();

function registerTransfer(
    transferId,
    response
) {
    if (
        activeTransfers.has(
            transferId
        )
    ) {
        return false;
    }

    activeTransfers.set(
        transferId,
        {
            response,
            timeout: null,
            streamStarted: false
        }
    );

    return true;
}

function getTransferResponse(
    transferId
) {
    const transfer =
        activeTransfers.get(
            transferId
        );

    return transfer
        ? transfer.response
        : null;
}

function setTransferTimeout(
    transferId,
    timeout
) {
    const transfer =
        activeTransfers.get(
            transferId
        );

    if (!transfer) {
        return false;
    }

    transfer.timeout =
        timeout;

    return true;
}

function markStreamStarted(
    transferId
) {
    const transfer =
        activeTransfers.get(
            transferId
        );

    if (!transfer) {
        return false;
    }

    transfer.streamStarted =
        true;

    if (transfer.timeout) {
        clearTimeout(
            transfer.timeout
        );

        transfer.timeout =
            null;
    }

    return true;
}

function hasStreamStarted(
    transferId
) {
    const transfer =
        activeTransfers.get(
            transferId
        );

    return Boolean(
        transfer &&
        transfer.streamStarted
    );
}

function removeTransfer(
    transferId
) {
    const transfer =
        activeTransfers.get(
            transferId
        );

    if (!transfer) {
        return false;
    }

    if (transfer.timeout) {
        clearTimeout(
            transfer.timeout
        );
    }

    activeTransfers.delete(
        transferId
    );

    return true;
}

module.exports = {
    registerTransfer,
    getTransferResponse,
    setTransferTimeout,
    markStreamStarted,
    hasStreamStarted,
    removeTransfer
};