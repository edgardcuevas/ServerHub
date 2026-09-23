const {
    exec,
    execFile
} = require(
    "child_process"
);
function listarServicios() {

    return new Promise(
        (resolve, reject) => {

            let comando;

            if (
                process.platform === "win32"
            ) {

                comando =
                    'powershell -Command "Get-Service | Select-Object Name,Status | ConvertTo-Json -Compress"';

                exec(
                    comando,
                    {
                        maxBuffer:
                            10 * 1024 * 1024
                    },
                    (
                        error,
                        stdout
                    ) => {

                        if (error) {
                            return reject(error);
                        }

                        try {

                            let services =
                                JSON.parse(
                                    stdout
                                );

                            if (
                                !Array.isArray(
                                    services
                                )
                            ) {

                                services = [
                                    services
                                ];

                            }

                            return resolve(
                                services.map(
                                    service => ({
                                        name:
                                            service.Name,
                                        status:
                                            String(service.Status).toUpperCase()
                                    })
                                )
                            );

                        } catch (
                            parseError
                        ) {

                            return reject(
                                parseError
                            );

                        }

                    }
                );

                return;

            }

            comando =
                "systemctl list-units --type=service --all --no-pager --plain --no-legend";

            exec(
                comando,
                {
                    maxBuffer:
                        10 * 1024 * 1024
                },
                (
                    error,
                    stdout
                ) => {

                    if (error) {

                        return exec(
                            "service --status-all",
                            {
                                maxBuffer:
                                    10 * 1024 * 1024
                            },
                            (
                                fallbackError,
                                fallbackStdout
                            ) => {

                                if (
                                    fallbackError
                                ) {
                                    return reject(
                                        fallbackError
                                    );
                                }

                                const services =
                                    fallbackStdout
                                        .split("\n")
                                        .filter(Boolean)
                                        .map(line => {

                                            const status =
                                                line.includes("[ + ]")
                                                    ? "RUNNING"
                                                    : "STOPPED";

                                            const name =
                                                line
                                                    .replace(
                                                        /\[.*?\]/,
                                                        ""
                                                    )
                                                    .trim();

                                            return {
                                                name,
                                                status
                                            };

                                        });

                                resolve(
                                    services
                                );

                            }
                        );

                    }

                    const services =
                        stdout
                            .split("\n")
                            .filter(Boolean)
                            .filter(line =>
                                line.includes(".service")
                            )
                            .map(line => {

                                const parts =
                                    line
                                        .trim()
                                        .split(/\s+/);

                                return {
                                    name:
                                        parts[0],

                                    load:
                                        parts[1] ||
                                        "UNKNOWN",

                                    active:
                                        parts[2] ||
                                        "UNKNOWN",

                                    status:
                                        parts[3] ||
                                        "UNKNOWN"
                                };

                            });

                    resolve(
                        services
                    );

                }
            );

        }
    );

}

function obtenerServicioPorPid(
    pid
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const parsedPid =
                Number(pid);

            if (
                !Number.isInteger(
                    parsedPid
                ) ||
                parsedPid <= 0
            ) {
                return reject(
                    new Error(
                        "PID inválido"
                    )
                );
            }

            if (
                process.platform ===
                    "win32"
            ) {

                const script = [
                    "$service = Get-CimInstance",
                    "-ClassName Win32_Service",
                    `-Filter "ProcessId = ${parsedPid}"`,
                    "| Select-Object",
                    "-First 1",
                    "Name,State,ProcessId",
                    "| ConvertTo-Json",
                    "-Compress"
                ].join(" ");

                execFile(
                    "powershell.exe",
                    [
                        "-NoProfile",
                        "-NonInteractive",
                        "-Command",
                        script
                    ],
                    {
                        windowsHide:
                            true,
                        timeout:
                            15000,
                        maxBuffer:
                            1024 * 1024
                    },
                    (
                        error,
                        stdout,
                        stderr
                    ) => {

                        if (error) {
                            return reject(
                                new Error(
                                    stderr?.trim() ||
                                    error.message
                                )
                            );
                        }

                        const output =
                            stdout.trim();

                        if (!output) {
                            return resolve(
                                null
                            );
                        }

                        try {

                            const service =
                                JSON.parse(
                                    output
                                );

                            if (
                                !service ||
                                !service.Name
                            ) {
                                return resolve(
                                    null
                                );
                            }

                            return resolve({
                                name:
                                    service.Name,
                                status:
                                    service.State
                                        ? String(
                                            service.State
                                        ).toUpperCase()
                                        : null,
                                pid:
                                    Number(
                                        service.ProcessId
                                    ) || null,
                                manager:
                                    "windows-service"
                            });

                        } catch (
                            parseError
                        ) {

                            return reject(
                                new Error(
                                    "No se pudo interpretar la información del servicio"
                                )
                            );

                        }

                    }
                );

                return;

            }

            execFile(
                "systemctl",
                [
                    "status",
                    String(parsedPid),
                    "--no-pager",
                    "--full"
                ],
                {
                    timeout:
                        15000,
                    maxBuffer:
                        1024 * 1024,
                    env: {
                        ...process.env,
                        LANG:
                            "C",
                        LC_ALL:
                            "C"
                    }
                },
                (
                    error,
                    stdout,
                    stderr
                ) => {

                    const output =
                        [
                            stdout,
                            stderr
                        ]
                            .filter(Boolean)
                            .join("\n")
                            .trim();

                    if (!output) {
                        return resolve(
                            null
                        );
                    }

                    const unitMatch =
                        output.match(
                            /^[\s●○×]*([^\s]+\.service)\b/m
                        );

                    if (!unitMatch) {
                        return resolve(
                            null
                        );
                    }

                    const serviceName =
                        unitMatch[1];

                    execFile(
                        "systemctl",
                        [
                            "show",
                            serviceName,
                            "--property=Id",
                            "--property=ActiveState",
                            "--property=SubState",
                            "--property=MainPID",
                            "--no-pager"
                        ],
                        {
                            timeout:
                                15000,
                            maxBuffer:
                                1024 * 1024,
                            env: {
                                ...process.env,
                                LANG:
                                    "C",
                                LC_ALL:
                                    "C"
                            }
                        },
                        (
                            showError,
                            showStdout,
                            showStderr
                        ) => {

                            if (showError) {
                                return reject(
                                    new Error(
                                        showStderr?.trim() ||
                                        showError.message
                                    )
                                );
                            }

                            const properties =
                                {};

                            for (
                                const line of
                                showStdout.split(
                                    /\r?\n/
                                )
                            ) {

                                const separatorIndex =
                                    line.indexOf(
                                        "="
                                    );

                                if (
                                    separatorIndex <= 0
                                ) {
                                    continue;
                                }

                                const key =
                                    line
                                        .slice(
                                            0,
                                            separatorIndex
                                        )
                                        .trim();

                                const value =
                                    line
                                        .slice(
                                            separatorIndex + 1
                                        )
                                        .trim();

                                properties[key] =
                                    value;

                            }

                            return resolve({
                                name:
                                    properties.Id ||
                                    serviceName,
                                status:
                                    properties.ActiveState
                                        ? String(
                                            properties.ActiveState
                                        ).toUpperCase()
                                        : null,
                                subStatus:
                                    properties.SubState
                                        ? String(
                                            properties.SubState
                                        ).toUpperCase()
                                        : null,
                                pid:
                                    Number(
                                        properties.MainPID
                                    ) || null,
                                manager:
                                    "systemd"
                            });

                        }
                    );

                }
            );

        }
    );

}

function iniciarServicio(
    serviceName
) {

    return new Promise(
        (resolve, reject) => {

            if (
                !serviceName ||
                typeof serviceName !== "string"
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio requerido"
                    )
                );
            }

            if (
                !/^[a-zA-Z0-9_.\-@]+$/.test(
                    serviceName
                )
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio inválido"
                    )
                );
            }

            let comando;

            if (
                process.platform === "win32"
            ) {

                comando =
                    `powershell -Command "Start-Service -Name '${serviceName}'"`;

            } else {

                comando =
    `systemctl start ${serviceName}`;


            }

            exec(
                comando,
                {
                    maxBuffer:
                        10 * 1024 * 1024
                },
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
                        serviceName
                    });

                }
            );

        }
    );

}

function detenerServicio(
    serviceName
) {

    return new Promise(
        (resolve, reject) => {

            if (
                !serviceName ||
                typeof serviceName !== "string"
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio requerido"
                    )
                );
            }

            if (
                !/^[a-zA-Z0-9_.\-@]+$/.test(
                    serviceName
                )
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio inválido"
                    )
                );
            }

            let comando;

            if (
                process.platform === "win32"
            ) {

                comando =
                    `powershell -Command "Stop-Service -Name '${serviceName}'"`;

            } else {

                comando =
                    `systemctl stop ${serviceName}`;

            }

            exec(
                comando,
                {
                    maxBuffer:
                        10 * 1024 * 1024
                },
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
                        serviceName
                    });

                }
            );

        }
    );

}

function reiniciarServicio(
    serviceName
) {

    return new Promise(
        (resolve, reject) => {

            if (
                !serviceName ||
                typeof serviceName !== "string"
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio requerido"
                    )
                );
            }

            if (
                !/^[a-zA-Z0-9_.\-@]+$/.test(
                    serviceName
                )
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio inválido"
                    )
                );
            }

            let comando;

            if (
                process.platform === "win32"
            ) {

                comando =
                    `powershell -Command "Restart-Service -Name '${serviceName}'"`;

            } else {

                comando =
                    `systemctl restart ${serviceName}`;

            }

            exec(
                comando,
                {
                    maxBuffer:
                        10 * 1024 * 1024
                },
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
                        serviceName
                    });

                }
            );

        }
    );

}
module.exports = {
    listarServicios,
    obtenerServicioPorPid,
    iniciarServicio,
    detenerServicio,
    reiniciarServicio
};