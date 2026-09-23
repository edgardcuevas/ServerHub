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

function obtenerDetallesServicio(
    serviceName
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            if (
                typeof serviceName !==
                    "string" ||
                !serviceName.trim()
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio requerido"
                    )
                );
            }

            const normalizedServiceName =
                serviceName.trim();

            if (
                normalizedServiceName.length >
                    255 ||
                !/^[a-zA-Z0-9_.\-@]+$/.test(
                    normalizedServiceName
                )
            ) {
                return reject(
                    new Error(
                        "Nombre de servicio inválido"
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
                    `-Filter "Name = '${normalizedServiceName}'"`,
                    ";",
                    "if ($null -eq $service) {",
                    "exit 3",
                    "}",
                    ";",
                    "$service |",
                    "Select-Object",
                    "Name,",
                    "DisplayName,",
                    "State,",
                    "StartMode,",
                    "ProcessId,",
                    "PathName,",
                    "Description,",
                    "ServiceType,",
                    "StartName",
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

                        if (
                            error &&
                            error.code === 3
                        ) {
                            return reject(
                                new Error(
                                    "Servicio no encontrado"
                                )
                            );
                        }

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
                            return reject(
                                new Error(
                                    "Servicio no encontrado"
                                )
                            );
                        }

                        try {

                            const service =
                                JSON.parse(
                                    output
                                );

                            return resolve({
                                name:
                                    service.Name ||
                                    normalizedServiceName,
                                displayName:
                                    service.DisplayName ||
                                    null,
                                description:
                                    service.Description ||
                                    null,
                                status:
                                    service.State
                                        ? String(
                                            service.State
                                        ).toUpperCase()
                                        : null,
                                subStatus:
                                    null,
                                startMode:
                                    service.StartMode
                                        ? String(
                                            service.StartMode
                                        ).toUpperCase()
                                        : null,
                                enabled:
                                    service.StartMode
                                        ? ![
                                            "DISABLED"
                                        ].includes(
                                            String(
                                                service.StartMode
                                            ).toUpperCase()
                                        )
                                        : null,
                                pid:
                                    Number(
                                        service.ProcessId
                                    ) || null,
                                executablePath:
                                    service.PathName ||
                                    null,
                                account:
                                    service.StartName ||
                                    null,
                                serviceType:
                                    service.ServiceType ||
                                    null,
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

            if (
                process.platform ===
                    "linux"
            ) {

                execFile(
                    "systemctl",
                    [
                        "show",
                        normalizedServiceName,
                        "--property=Id",
                        "--property=Description",
                        "--property=LoadState",
                        "--property=ActiveState",
                        "--property=SubState",
                        "--property=UnitFileState",
                        "--property=MainPID",
                        "--property=ExecMainStartTimestamp",
                        "--property=FragmentPath",
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
                        error,
                        stdout,
                        stderr
                    ) => {

                        if (
                            error?.code ===
                                "ENOENT"
                        ) {
                            return reject(
                                new Error(
                                    "systemd no está disponible en este servidor"
                                )
                            );
                        }

                        if (error) {
                            return reject(
                                new Error(
                                    stderr?.trim() ||
                                    error.message
                                )
                            );
                        }

                        const properties =
                            {};

                        for (
                            const line of
                            stdout.split(
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

                        if (
                            !properties.Id ||
                            properties.LoadState ===
                                "not-found"
                        ) {
                            return reject(
                                new Error(
                                    "Servicio no encontrado"
                                )
                            );
                        }

                        const unitFileState =
                            properties.UnitFileState
                                ? String(
                                    properties.UnitFileState
                                ).toUpperCase()
                                : null;

                        const enabledStates = [
                            "ENABLED",
                            "ENABLED-RUNTIME",
                            "STATIC",
                            "INDIRECT",
                            "ALIAS",
                            "GENERATED"
                        ];

                        return resolve({
                            name:
                                properties.Id,
                            displayName:
                                properties.Description ||
                                null,
                            description:
                                properties.Description ||
                                null,
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
                            loadState:
                                properties.LoadState
                                    ? String(
                                        properties.LoadState
                                    ).toUpperCase()
                                    : null,
                            startMode:
                                unitFileState,
                            enabled:
                                unitFileState
                                    ? enabledStates.includes(
                                        unitFileState
                                    )
                                    : null,
                            pid:
                                Number(
                                    properties.MainPID
                                ) || null,
                            executablePath:
                                null,
                            account:
                                null,
                            serviceType:
                                "systemd-unit",
                            started:
                                properties
                                    .ExecMainStartTimestamp ||
                                null,
                            unitFile:
                                properties.FragmentPath ||
                                null,
                            manager:
                                "systemd"
                        });

                    }
                );

                return;

            }

            return reject(
                new Error(
                    `Administrador de servicios no compatible con la plataforma: ${process.platform}`
                )
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
    obtenerDetallesServicio,
    detenerServicio,
    reiniciarServicio
};