const express =
    require("express");

const router =
    express.Router();

const {
    authenticate
} = require(
    "../middlewares/auth.middleware"
);

const {
    requireAdminSession
} = require(
    "../middlewares/admin-session.middleware"
);

const {
    createDownloadTransfer,
    createUploadTransfer,
    downloadTransfer,
    uploadTransfer
} = require(
    "../controllers/transfer.controller"
);

const {
    requireTransferAdminSession
} = require(
    "../middlewares/transfer-admin-session.middleware"
);

/*
 * DOWNLOAD
 */

router.post(
    "/:id/download",
    authenticate,
    requireAdminSession,
    createDownloadTransfer
);

router.get(
    "/download/:transferId",
    authenticate,
    requireTransferAdminSession,
    downloadTransfer
);

/*
 * UPLOAD
 */

router.post(
    "/:id/upload",
    authenticate,
    requireAdminSession,
    createUploadTransfer
);

// Upload transfer

router.put(
    "/upload/:transferId",
    authenticate,
    requireTransferAdminSession,
    uploadTransfer
);

module.exports = router;