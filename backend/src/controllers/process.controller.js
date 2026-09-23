const serverService = require("../services/server.service");

const {
    createCommand
} = require(
    "../services/command.service"
);

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

async function listProcesses(
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
                "LIST_PROCESSES",
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
async function getProcessDetails(
    req,
    res
) {

    try {

        const {
            pid
        } = req.body;

        const parsedPid =
            Number(pid);

        if (
            !Number.isInteger(
                parsedPid
            ) ||
            parsedPid <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "PID inválido"
            });
        }

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "GET_PROCESS_DETAILS",
                {
                    pid:
                        parsedPid
                }
            );

        return res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message:
                error.message
        });

    }

}

async function getProcessTree(
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
                "GET_PROCESS_TREE",
                {}
            );

        return res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message:
                error.message
        });

    }

}

async function startProcess(
    req,
    res
) {

    try {

        const {
            executable,
            args = [],
            workingDirectory
        } = req.body;

        if (
            typeof executable !==
                "string" ||
            !executable.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Ejecutable requerido"
            });
        }

        const normalizedExecutable =
            executable.trim();

        if (
            normalizedExecutable.length >
                100 ||
            !/^[a-zA-Z0-9._-]+$/.test(
                normalizedExecutable
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Nombre de ejecutable inválido"
            });
        }

        if (
            !Array.isArray(args)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Los argumentos deben ser un arreglo"
            });
        }

        if (
            args.length > 50
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Demasiados argumentos"
            });
        }

        const invalidArgumentIndex =
            args.findIndex(
                argument =>
                    typeof argument !==
                        "string" ||
                    argument.length >
                        1000 ||
                    /[\0\r\n]/.test(
                        argument
                    )
            );

        if (
            invalidArgumentIndex !== -1
        ) {
            return res.status(400).json({
                success: false,
                message:
                    `Argumento inválido en la posición ${invalidArgumentIndex}`
            });
        }

        if (
            typeof workingDirectory !==
                "string" ||
            !workingDirectory.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Directorio de trabajo requerido"
            });
        }

        if (
            workingDirectory.length >
                4096 ||
            /[\0\r\n]/.test(
                workingDirectory
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Directorio de trabajo inválido"
            });
        }

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "START_PROCESS",
                {
                    executable:
                        normalizedExecutable,
                    args:
                        [...args],
                    workingDirectory:
                        workingDirectory.trim()
                }
            );

        return res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message:
                error.message
        });

    }

}

module.exports = {
    listProcesses,
    startProcess,
    killProcess,
    getProcessDetails,
    getProcessTree
};
