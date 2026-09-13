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
    createDownloadTransfer
} = require(
    "../controllers/transfer.controller"
);

const {
    downloadTransfer
} = require(
    "../controllers/transfer.controller"
);

const {
    requireTransferAdminSession
} = require(
    "../middlewares/transfer-admin-session.middleware"
);



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
module.exports = router;
