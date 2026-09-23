const {
    exec,
    spawn
} = require(
    "child_process"
);

const fs =
    require("fs/promises");

const path =
    require("path");

const si =
    require("systeminformation");


    const {
    obtenerServicioPorPid
} = require(
    "./service.service"
);

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

async function clasificarProceso(
    pid
) {

    const processInfo =
        await obtenerDetallesProceso(
            pid
        );

    let serviceInfo =
        null;

    try {

        serviceInfo =
            await obtenerServicioPorPid(
                processInfo.pid
            );

    } catch (error) {

        serviceInfo =
            null;

    }

    if (serviceInfo) {

        return {
            process:
                processInfo,
            source:
                "SERVICE",
            restartable:
                true,
            restartMethod:
                "SERVICE",
            service:
                serviceInfo
        };

    }

    const hasExecutable =
        typeof processInfo.path ===
            "string" &&
        Boolean(
            processInfo.path.trim()
        );

    const hasCommand =
        typeof processInfo.command ===
            "string" &&
        Boolean(
            processInfo.command.trim()
        );

    const restartable =
        hasExecutable &&
        hasCommand;

    return {
        process:
            processInfo,
        source:
            "EXTERNAL",
        restartable,
        restartMethod:
            restartable
                ? "PROCESS"
                : "UNSUPPORTED",
        service:
            null
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


async function iniciarProceso(
    options
) {

    if (
        !options ||
        typeof options !== "object" ||
        Array.isArray(options)
    ) {
        throw new Error(
            "Configuración del proceso requerida"
        );
    }

    const {
        executable,
        args = [],
        workingDirectory
    } = options;

    if (
        typeof executable !== "string" ||
        !executable.trim()
    ) {
        throw new Error(
            "Ejecutable requerido"
        );
    }

    const normalizedExecutable =
        executable.trim();

    if (
        normalizedExecutable.length >
            100
    ) {
        throw new Error(
            "Nombre de ejecutable demasiado largo"
        );
    }

    if (
        !/^[a-zA-Z0-9._-]+$/.test(
            normalizedExecutable
        )
    ) {
        throw new Error(
            "Nombre de ejecutable inválido"
        );
    }

    if (
        normalizedExecutable.includes(
            "/"
        ) ||
        normalizedExecutable.includes(
            "\\"
        )
    ) {
        throw new Error(
            "No se permiten rutas en el nombre del ejecutable"
        );
    }

    if (
        !Array.isArray(args)
    ) {
        throw new Error(
            "Los argumentos deben ser un arreglo"
        );
    }

    if (
        args.length > 50
    ) {
        throw new Error(
            "Demasiados argumentos"
        );
    }

    const normalizedArgs =
        args.map(
            (
                argument,
                index
            ) => {

                if (
                    typeof argument !==
                        "string"
                ) {
                    throw new Error(
                        `Argumento inválido en la posición ${index}`
                    );
                }

                if (
                    argument.length >
                        1000
                ) {
                    throw new Error(
                        `Argumento demasiado largo en la posición ${index}`
                    );
                }

                if (
                    /[\0\r\n]/.test(
                        argument
                    )
                ) {
                    throw new Error(
                        `Argumento inválido en la posición ${index}`
                    );
                }

                return argument;

            }
        );

    if (
        typeof workingDirectory !==
            "string" ||
        !workingDirectory.trim()
    ) {
        throw new Error(
            "Directorio de trabajo requerido"
        );
    }

    const normalizedWorkingDirectory =
        path.resolve(
            workingDirectory.trim()
        );

    if (
        !path.isAbsolute(
            normalizedWorkingDirectory
        )
    ) {
        throw new Error(
            "El directorio de trabajo debe ser absoluto"
        );
    }

    let directoryStats;

    try {

        directoryStats =
            await fs.stat(
                normalizedWorkingDirectory
            );

    } catch (error) {

        throw new Error(
            "El directorio de trabajo no existe"
        );

    }

    if (
        !directoryStats.isDirectory()
    ) {
        throw new Error(
            "La ruta de trabajo no es un directorio"
        );
    }

    return new Promise(
        (
            resolve,
            reject
        ) => {

            let settled =
                false;

            const childProcess =
                spawn(
                    normalizedExecutable,
                    normalizedArgs,
                    {
                        cwd:
                            normalizedWorkingDirectory,
                        detached:
                            true,
                        shell:
                            false,
                        windowsHide:
                            true,
                        stdio:
                            "ignore"
                    }
                );

            childProcess.once(
                "error",
                error => {

                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    reject(
                        new Error(
                            `No se pudo iniciar el proceso: ${error.message}`
                        )
                    );

                }
            );

            childProcess.once(
                "spawn",
                () => {

                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    childProcess.unref();

                    resolve({
                        success:
                            true,
                        pid:
                            childProcess.pid,
                        executable:
                            normalizedExecutable,
                        args:
                            normalizedArgs,
                        workingDirectory:
                            normalizedWorkingDirectory,
                        detached:
                            true
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
    clasificarProceso,
    matarProceso,
    iniciarProceso,
    obtenerArbolProcesos
};