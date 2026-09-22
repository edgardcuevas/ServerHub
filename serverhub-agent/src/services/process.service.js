const { exec } = require("child_process");
const si =
    require("systeminformation");

function listarProcesos() {

    return new Promise(
        (resolve, reject) => {

            const comando =
                process.platform === "win32"
                    ? "tasklist /FO CSV /NH"
                    : "ps -eo pid,comm";

            exec(
                comando,
                (
                    error,
                    stdout
                ) => {

                    if (error) {
                        return reject(error);
                    }

                    if (
                        process.platform === "win32"
                    ) {

                        const processes =
                            stdout
                                .trim()
                                .split("\n")
                                .map(line => {

                                    const parts =
                                        line
                                            .replace(/\r/g, "")
                                            .split('","')
                                            .map(p =>
                                                p.replace(/^"/, "")
                                                 .replace(/"$/, "")
                                            );

                                    return {
                                        name: parts[0],
                                        pid: Number(parts[1])
                                    };

                                });

                        return resolve(
                            processes
                        );

                    }

                    const processes =
                        stdout
                            .trim()
                            .split("\n")
                            .slice(1)
                            .map(line => {

                                const parts =
                                    line
                                        .trim()
                                        .split(/\s+/);

                                return {
                                    pid: Number(parts[0]),
                                    name: parts[1]
                                };

                            });

                    resolve(
                        processes
                    );

                }
            );

        }
    );

}


async function obtenerDetallesProceso(
    pid
) {

    const parsedPid =
        Number(pid);

    if (
        !Number.isInteger(
            parsedPid
        ) ||
        parsedPid <= 0
    ) {
        throw new Error(
            "PID inválido"
        );
    }

    const processData =
        await si.processes();

    const processInfo =
        processData.list.find(
            processItem =>
                processItem.pid ===
                    parsedPid
        );

    if (!processInfo) {
        throw new Error(
            "Proceso no encontrado"
        );
    }

    return {
        pid:
            processInfo.pid,
        ppid:
            processInfo.parentPid ??
            null,
        name:
            processInfo.name ||
            null,
        command:
            processInfo.command ||
            null,
        path:
            processInfo.path ||
            null,
        user:
            processInfo.user ||
            null,
        state:
            processInfo.state ||
            null,
        cpu:
            Number.isFinite(
                processInfo.cpu
            )
                ? processInfo.cpu
                : 0,
        memory:
            Number.isFinite(
                processInfo.memRss
            )
                ? processInfo.memRss
                : 0,
        memoryPercent:
            Number.isFinite(
                processInfo.mem
            )
                ? processInfo.mem
                : 0,
        started:
            processInfo.started ||
            null,
        running:
            true
    };

}

function matarProceso(
    pid
) {

    return new Promise(
        (resolve, reject) => {

            if (
                !pid ||
                Number.isNaN(
                    Number(pid)
                )
            ) {

                return reject(
                    new Error(
                        "PID inválido"
                    )
                );

            }

            let comando;

            if (
                process.platform === "win32"
            ) {

                comando =
                    `taskkill /PID ${pid} /F`;

            } else {

                comando =
                    `kill -9 ${pid}`;

            }

            exec(
                comando,
                (
                    error,
                    stdout,
                    stderr
                ) => {

                    if (error) {

                        return reject(
                            new Error(
                                stderr ||
                                error.message
                            )
                        );

                    }

                    resolve({
                        success: true,
                        pid
                    });

                }
            );

        }
    );

}

async function obtenerArbolProcesos() {

    const processData =
        await si.processes();

    const processMap =
        new Map();

    for (
        const processItem of
        processData.list
    ) {

        const pid =
            Number(
                processItem.pid
            );

        const ppid =
            Number(
                processItem.parentPid
            );

        if (
            !Number.isInteger(pid) ||
            pid < 0
        ) {
            continue;
        }

        processMap.set(
            pid,
            {
                pid,
                ppid:
                    Number.isInteger(ppid)
                        ? ppid
                        : null,
                name:
                    processItem.name ||
                    null,
                state:
                    processItem.state ||
                    null,
                cpu:
                    Number.isFinite(
                        processItem.cpu
                    )
                        ? processItem.cpu
                        : 0,
                memory:
                    Number.isFinite(
                        processItem.memRss
                    )
                        ? processItem.memRss
                        : 0,
                memoryPercent:
                    Number.isFinite(
                        processItem.mem
                    )
                        ? processItem.mem
                        : 0,
                children: []
            }
        );

    }

    const roots = [];

    for (
        const processNode of
        processMap.values()
    ) {

        const parent =
            processMap.get(
                processNode.ppid
            );

        const hasValidParent =
            parent &&
            parent.pid !==
                processNode.pid;

        if (hasValidParent) {

            parent.children.push(
                processNode
            );

        } else {

            roots.push(
                processNode
            );

        }

    }

    const sortNodes =
        nodes => {

            nodes.sort(
                (
                    firstProcess,
                    secondProcess
                ) =>
                    firstProcess.name
                        ?.localeCompare(
                            secondProcess.name ||
                            ""
                        ) ||
                    firstProcess.pid -
                        secondProcess.pid
            );

            for (
                const processNode of
                nodes
            ) {
                sortNodes(
                    processNode.children
                );
            }

        };

    sortNodes(
        roots
    );

    return {
        count:
            processMap.size,
        roots
    };

}

module.exports = {
    listarProcesos,
    obtenerDetallesProceso,
    matarProceso,
    obtenerArbolProcesos
};