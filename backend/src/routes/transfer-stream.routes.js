const express =
    require("express");

const router =
    express.Router();

const {
    receiveStream
} = require(
    "../controllers/transfer-stream.controller"
);

const {
    authenticateAgentStream
} = require(
    "../middlewares/agent-stream.middleware"
);


router.post(
    "/:transferId",
    authenticateAgentStream,
    receiveStream
);
module.exports = router;