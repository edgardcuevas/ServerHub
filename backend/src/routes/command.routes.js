const express = require("express");

const router = express.Router();

const {
    authenticate
} = require(
    "../middlewares/auth.middleware"
);

const {
    authenticateAgent
} = require(
    "../middlewares/agent-auth.middleware"
);

const {
    getPendingCommand,
    completeCommand,
    downloadCommandFile,
    getPendingCommands
} = require(
    "../controllers/command.controller"
);

router.post(
    "/pending",
    authenticateAgent,
    getPendingCommand
);

router.post(
    "/complete",
    authenticateAgent,
    completeCommand
);


router.get(
    "/download/:id",
    authenticate,
    downloadCommandFile
);

router.post(
    "/pending-batch",
    authenticateAgent,
    getPendingCommands
);
module.exports = router;