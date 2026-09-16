const activeUploads =
    new Map();

function registerUpload(
    transferId,
    request,
    response
) {
    if (
        activeUploads.has(
            transferId
        )
    ) {
        return false;
    }

    activeUploads.set(
        transferId,
        {
            request,
            response,
            timeout: null,
            streamStarted: false
        }
    );

    return true;
}

function getUploadRequest(
    transferId
) {
    const upload =
        activeUploads.get(
            transferId
        );

    return upload
        ? upload.request
        : null;
}

function getUploadResponse(
    transferId
) {
    const upload =
        activeUploads.get(
            transferId
        );

    return upload
        ? upload.response
        : null;
}

function setUploadTimeout(
    transferId,
    timeout
) {
    const upload =
        activeUploads.get(
            transferId
        );

    if (!upload) {
        return false;
    }

    upload.timeout =
        timeout;

    return true;
}

function markUploadStarted(
    transferId
) {
    const upload =
        activeUploads.get(
            transferId
        );

    if (!upload) {
        return false;
    }

    if (upload.streamStarted) {
        return false;
    }

    upload.streamStarted =
        true;

    if (upload.timeout) {
        clearTimeout(
            upload.timeout
        );

        upload.timeout =
            null;
    }

    return true;
}

function removeUpload(
    transferId
) {
    const upload =
        activeUploads.get(
            transferId
        );

    if (!upload) {
        return false;
    }

    if (upload.timeout) {
        clearTimeout(
            upload.timeout
        );
    }

    activeUploads.delete(
        transferId
    );

    return true;
}

module.exports = {
    registerUpload,
    getUploadRequest,
    getUploadResponse,
    setUploadTimeout,
    markUploadStarted,
    removeUpload
};