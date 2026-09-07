const serverService = require("../services/server.service");
const pool = require("../config/db");
const getHealth = (req, res) => {
    res.json({
        status: "ok",
        message: "🚀 ServerHub Backend funcionando"
    });
};
const {
    createCommand
} = require(
    "../services/command.service"
);

const getServerInfo = (req, res) => {
    res.json({
        nombre: "Mi VPS",
        sistema: "Ubuntu 24.04",
        cpu: "2 vCPU",
        memoria: "4 GB",
        almacenamiento: "80 GB",
        estado: "En línea"
    });
};


async function createServer(req, res) {
    try {

        const server = await serverService.createServer(
            req.user.id,
            req.body
        );

        res.status(201).json({
            success: true,
            server
        });

    } catch (error) {

        res.status(400).json({
            success: false,
            message: error.message
        });

    }
}

async function getServers(req, res) {
    try {

        const servers = await serverService.getServers(
            req.user.id
        );

        res.json({
            success: true,
            servers
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
}

async function getServerById(req, res) {
    try {

        const server = await serverService.getServerById(
            req.user.id,
            req.params.id
        );

        if (!server) {
            return res.status(404).json({
                success: false,
                message: "Servidor no encontrado"
            });
        }

        res.json({
            success: true,
            server
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
}

async function updateServer(req, res) {
    try {

        const server = await serverService.updateServer(
            req.user.id,
            req.params.id,
            req.body
        );

        if (!server) {
            return res.status(404).json({
                success: false,
                message: "Servidor no encontrado"
            });
        }

        res.json({
            success: true,
            server
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
}

async function deleteServer(req, res) {
    try {

        const server = await serverService.deleteServer(
            req.user.id,
            req.params.id
        );

        if (!server) {
            return res.status(404).json({
                success: false,
                message: "Servidor no encontrado"
            });
        }

        res.json({
            success: true,
            message: "Servidor eliminado"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
}
async function getServerMetrics(req, res) {

    try {

        const metrics =
            await serverService.getServerMetrics(
                req.user.id,
                req.params.id
            );

        res.json({
            success: true,
            metrics
        });

    } catch (error) {

        res.status(404).json({
            success: false,
            message: error.message
        });

    }
}

async function getLatestMetrics(req, res) {

    try {

        const data =
            await serverService.getLatestMetrics(
                req.user.id,
                req.params.id
            );

        res.json({
            success: true,
            data
        });

    } catch (error) {

        res.status(404).json({
            success: false,
            message: error.message
        });

    }
}

async function getServerAgent(req, res) {

    try {

        const agent =
            await serverService.getServerAgent(
                req.user.id,
                req.params.id
            );

        res.json({
            success: true,
            agent
        });

    } catch (error) {

        res.status(404).json({
            success: false,
            message: error.message
        });

    }
}

async function verifyServerPassword(
    req,
    res
) {

    try {

        const valid =
            await serverService
                .verifyServerPassword(
                    req.user.id,
                    req.params.id,
                    req.body.password
                );

        res.json({
            success: valid
        });

    } catch (error) {

        res.status(400).json({
            success: false,
            message: error.message
        });

    }

}

async function startService(
    req,
    res
) {

    try {

        const {
            serviceName
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "START_SERVICE",
                {
                    serviceName
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function stopService(
    req,
    res
) {

    try {

        const {
            serviceName
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "STOP_SERVICE",
                {
                    serviceName
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function restartService(
    req,
    res
) {

    try {

        const {
            serviceName
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "RESTART_SERVICE",
                {
                    serviceName
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function listServices(req, res) {

    try {

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "LIST_SERVICES",
                {}
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function browseFiles(
    req,
    res
) {

    try {

        const {
            path
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "FILE_BROWSER",
                {
                    path
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function downloadFile(
    req,
    res
) {

    try {

        const {
            path
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "DOWNLOAD_FILE",
                {
                    path
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function uploadFile(
    req,
    res
) {

    try {

        const {
            path,
            content
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "UPLOAD_FILE",
                {
                    path,
                    content
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function createFolder(
    req,
    res
) {

    try {

        const {
    path
} = req.body;


        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "CREATE_FOLDER",
                {
                    path
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function renameFile(
    req,
    res
) {

    try {

        const {
            oldPath,
            newPath
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "RENAME_FILE",
                {
                    oldPath,
                    newPath
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function deleteFile(
    req,
    res
) {

    try {

        const {
            path
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "DELETE_FILE",
                {
                    path
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function moveFile(
    req,
    res
) {

    try {

        const {
            sourcePath,
            destinationPath
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "MOVE_FILE",
                {
                    sourcePath,
                    destinationPath
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function getCommandStatus(req, res) {

    try {

        const agent = await serverService.getServerAgent(
            req.user.id,
            req.params.id
        );

        const result = await pool.query(
            `
            SELECT id, command_type, status, result, created_at, executed_at
            FROM agent_commands
            WHERE id = $1
            AND agent_id = $2
            `,
            [req.params.commandId, agent.id]
        );

        const command = result.rows[0];

        if (!command) {
            return res.status(404).json({
                success: false,
                message: "Comando no encontrado"
            });
        }

        res.json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

async function killProcess(
    req,
    res
) {

    try {

        const {
            pid
        } = req.body;

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "KILL_PROCESS",
                {
                    pid
                }
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}


async function rebootServer(
    req,
    res
) {

    try {

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "REBOOT_SERVER"
            );

        res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

}

module.exports = {
    getHealth,
    getServerInfo,
    getLatestMetrics,
    createServer,
    getServers,
    getServerById,
    updateServer,
    deleteServer,
    getServerMetrics,
    getServerAgent,
    verifyServerPassword,
    startService,
    stopService,
    restartService,
    listServices,
    browseFiles,
    downloadFile,
    uploadFile,
    createFolder,
    renameFile,
    deleteFile,
    moveFile,
    getCommandStatus,
    killProcess,
    rebootServer
};