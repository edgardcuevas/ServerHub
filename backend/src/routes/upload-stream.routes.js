const express =
    require("express");

const router =
    express.Router();

const {
    receiveUploadStream
} = require(
    "../controllers/upload-stream.controller"
);

const {
    authenticateAgentStream
} = require(
    "../middlewares/agent-stream.middleware"
);

router.post(
    "/:transferId",
    authenticateAgentStream,
    receiveUploadStream
);

module.exports = router;