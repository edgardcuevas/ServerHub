const express = require("express");

const router = express.Router();
const {
    authenticate
} = require("../middlewares/auth.middleware");

const {
    requireAdminSession
} = require(
    "../middlewares/admin-session.middleware"
);

const {
    getHealth,
    getServerInfo,
    createServer,
    getServers,
    getServerById,
    updateServer,
    deleteServer,
    getServerMetrics,
    getLatestMetrics,
    getServerAgent,
    verifyServerPassword,
    startService,
    stopService,
    restartService,
    browseFiles,
    downloadFile,
    uploadFile,
    createFolder,
    renameFile,
    deleteFile,
    moveFile,
    getCommandStatus
} = require("../controllers/server.controller");

router.get("/health", getHealth);

router.get("/info", getServerInfo);

router.post("/", authenticate, createServer);

router.get("/", authenticate, getServers);

router.get(
    "/:id/metrics",
    authenticate,
    getServerMetrics
);

router.get(
    "/:id/latest",
    authenticate,
    getLatestMetrics
);

router.get(
    "/:id/agent",
    authenticate,
    getServerAgent
);

router.get("/:id", authenticate, getServerById);

router.put("/:id", authenticate, updateServer);

router.delete("/:id", authenticate, deleteServer);


router.post(
    "/:id/verify-password",
    authenticate,
    verifyServerPassword
);

router.post(
    "/:id/services/start",
    authenticate,
    requireAdminSession,
    startService
);

router.post(
    "/:id/services/stop",
    authenticate,
    requireAdminSession,
    stopService
);

router.post(
    "/:id/services/restart",
    authenticate,
    requireAdminSession,
    restartService
);

router.post(
    "/:id/files/browse",
    authenticate,
    requireAdminSession,
    browseFiles
);

router.post(
    "/:id/files/download",
    authenticate,
    requireAdminSession,
    downloadFile
);

router.post(
    "/:id/files/upload",
    authenticate,
    requireAdminSession,
    uploadFile
);

router.post(
    "/:id/files/create-folder",
    authenticate,
    requireAdminSession,
    createFolder
);
router.post(
    "/:id/files/rename",
    authenticate,
    requireAdminSession,
    renameFile
);

router.post(
    "/:id/files/delete",
    authenticate,
    requireAdminSession,
    deleteFile
);

router.post(
    "/:id/files/move",
    authenticate,
    requireAdminSession,
    moveFile
);

router.get(
    "/:id/commands/:commandId",
    authenticate,
    requireAdminSession,
    getCommandStatus
);

module.exports = router;