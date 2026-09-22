const {
    execFile
} = require(
    "child_process"
);

const {
    listarServicios
} = require(
    "./service.service"
);

function executeFile(
    executable,
    args
) {

    return new Promise(
        resolve => {

            execFile(
                executable,
                args,
                {
                    windowsHide: true,
                    timeout: 10000,
                    maxBuffer:
                        1024 * 1024
                },
                (
                    error,
                    stdout,
                    stderr
                ) => {

                    if (error) {
                        return resolve(
                            null
                        );
                    }

                    return resolve(
                        String(
                            stdout ||
                            stderr ||
                            ""
                        ).trim()
                    );

                }
            );

        }
    );

}

function extractPostgreSQLVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /(\d+(?:\.\d+)+|\d+)/
        );

    return match
        ? match[1]
        : null;

}

function extractNodeJSVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /v?(\d+(?:\.\d+)+)/
        );

    return match
        ? match[1]
        : null;

}

function extractMySQLVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string" ||
        /mariadb/i.test(value)
    ) {
        return null;
    }

    const match =
        value.match(
            /(\d+(?:\.\d+)+)/
        );

    return match
        ? match[1]
        : null;

}

function extractRedisVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /(?:redis(?:-server|cli)?\s+)?v?([0-9]+(?:\.[0-9]+)+)/i
        );

    return match
        ? match[1]
        : null;

}

function extractNginxVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /nginx\/([0-9]+(?:\.[0-9]+)+)/i
        );

    return match
        ? match[1]
        : null;

}

function extractApacheVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /Apache\/([0-9]+(?:\.[0-9]+)+)/i
        );

    return match
        ? match[1]
        : null;

}

function extractPM2Version(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /([0-9]+(?:\.[0-9]+)+)/
        );

    return match
        ? match[1]
        : null;

}

function extractPythonVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /Python\s+([0-9]+(?:\.[0-9]+)+)/i
        );

    return match
        ? match[1]
        : null;

}

function extractJavaVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /(?:java|openjdk)\s+version\s+["']?([^"'\s]+)/i
        );

    return match
        ? match[1]
        : null;

}

function extractPostgreSQLServiceVersion(
    serviceName
) {

    if (
        !serviceName ||
        typeof serviceName !== "string"
    ) {
        return null;
    }

    const normalizedServiceName =
        serviceName
            .trim()
            .toLowerCase();

    const match =
        normalizedServiceName.match(
            /postgres(?:ql)?(?:-x\d+)?[-_]?(\d+(?:\.\d+)*)$/
        );

    return match
        ? match[1]
        : null;

}

function normalizeServiceStatus(
    service
) {

    const status =
        String(
            service.status ||
            ""
        )
            .trim()
            .toUpperCase();

    const active =
        String(
            service.active ||
            ""
        )
            .trim()
            .toUpperCase();

    if (
        status === "4" ||
        status === "RUNNING" ||
        status === "ACTIVE" ||
        active === "ACTIVE"
    ) {
        return "RUNNING";
    }

    if (
        status === "1" ||
        status === "STOPPED" ||
        status === "INACTIVE" ||
        status === "DEAD" ||
        active === "INACTIVE" ||
        active === "FAILED"
    ) {
        return "STOPPED";
    }

    if (
        status === "2"
    ) {
        return "START_PENDING";
    }

    if (
        status === "3"
    ) {
        return "STOP_PENDING";
    }

    if (
        status === "5"
    ) {
        return "CONTINUE_PENDING";
    }

    if (
        status === "6"
    ) {
        return "PAUSE_PENDING";
    }

    if (
        status === "7"
    ) {
        return "PAUSED";
    }

    return status ||
        active ||
        "UNKNOWN";

}

async function detectarPostgreSQL(
    services
) {

    const [
        availableServices,
        versionOutput
    ] = await Promise.all([
        Array.isArray(
            services
        )
            ? services
            : listarServicios(),
        executeFile(
            "psql",
            [
                "--version"
            ]
        )
    ]);

    const postgreSQLServices =
        availableServices.filter(
            service => {

                const serviceName =
                    String(
                        service.name ||
                        ""
                    ).toLowerCase();

                return (
                    serviceName.includes(
                        "postgresql"
                    ) ||
                    serviceName.includes(
                        "postgres"
                    )
                );

            }
        );

    const primaryService =
        postgreSQLServices.find(
            service =>
                normalizeServiceStatus(
                    service
                ) === "RUNNING"
        ) ||
        postgreSQLServices[0] ||
        null;

    const versionFromCommand =
        extractPostgreSQLVersion(
            versionOutput
        );

    const versionFromService =
    primaryService
        ? extractPostgreSQLServiceVersion(
            primaryService.name
        )
        : null;

    const installed =
        Boolean(
            versionOutput ||
            primaryService
        );

    return {
        id:
            "postgresql",
        name:
            "PostgreSQL",
        installed,
        version:
            versionFromCommand ||
            versionFromService ||
            null,
        executableAvailable:
            Boolean(
                versionOutput
            ),
        service: {
            installed:
                postgreSQLServices.length >
                    0,
            name:
                primaryService
                    ?.name ||
                null,
            status:
                primaryService
                    ? normalizeServiceStatus(
                        primaryService
                    )
                    : null
        }
    };

}

function extractDockerVersion(
    value
) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }

    const match =
        value.match(
            /Docker version\s+(\d+(?:\.\d+)+)/i
        );

    return match
        ? match[1]
        : null;

}


async function detectarDocker(
    services
) {

    const [
        availableServices,
        versionOutput
    ] = await Promise.all([
        Array.isArray(
            services
        )
            ? services
            : listarServicios(),
        executeFile(
            "docker",
            [
                "--version"
            ]
        )
    ]);

    const dockerServices =
        availableServices.filter(
            service => {

                const serviceName =
                    String(
                        service.name ||
                        ""
                    )
                        .trim()
                        .toLowerCase();

                return (
                    serviceName ===
                        "docker" ||
                    serviceName ===
                        "docker.service" ||
                    serviceName ===
                        "com.docker.service" ||
                    serviceName.includes(
                        "docker desktop"
                    )
                );

            }
        );

    const primaryService =
        dockerServices.find(
            service =>
                normalizeServiceStatus(
                    service
                ) === "RUNNING"
        ) ||
        dockerServices[0] ||
        null;

    const version =
        extractDockerVersion(
            versionOutput
        );

    const installed =
        Boolean(
            versionOutput ||
            primaryService
        );

    return {
        id:
            "docker",
        name:
            "Docker",
        installed,
        version,
        executableAvailable:
            Boolean(
                versionOutput
            ),
        service: {
            installed:
                dockerServices.length >
                    0,
            name:
                primaryService
                    ?.name ||
                null,
            status:
                primaryService
                    ? normalizeServiceStatus(
                        primaryService
                    )
                    : null
        }
    };

}

async function detectarNodeJS() {

    const versionOutput =
        await executeFile(
            "node",
            [
                "--version"
            ]
        );

    return {
        id:
            "nodejs",
        name:
            "Node.js",
        installed:
            Boolean(
                versionOutput
            ),
        version:
            extractNodeJSVersion(
                versionOutput
            ),
        executableAvailable:
            Boolean(
                versionOutput
            ),
        service: {
            installed:
                false,
            name:
                null,
            status:
                null
        }
    };

}

async function detectarMySQL(
    services
) {

    const [
        availableServices,
        mysqlOutput,
        mysqldOutput
    ] = await Promise.all([
        Array.isArray(
            services
        )
            ? services
            : listarServicios(),
        executeFile(
            "mysql",
            [
                "--version"
            ]
        ),
        executeFile(
            "mysqld",
            [
                "--version"
            ]
        )
    ]);

    const outputs = [
        mysqlOutput,
        mysqldOutput
    ];

    const versionOutput =
        outputs.find(
            output =>
                Boolean(
                    extractMySQLVersion(
                        output
                    )
                )
        ) ||
        null;

    const mariaDBDetected =
        outputs.some(
            output =>
                typeof output === "string" &&
                /mariadb/i.test(output)
        );

    const mysqlServices =
        availableServices.filter(
            service => {

                const serviceName =
                    String(
                        service.name ||
                        ""
                    )
                        .trim()
                        .toLowerCase()
                        .replace(
                            /\.service$/,
                            ""
                        );

                return (
                    serviceName ===
                        "mysql" ||
                    serviceName ===
                        "mysql80" ||
                    serviceName ===
                        "mysqld"
                );

            }
        );

    const primaryService =
        mysqlServices.find(
            service =>
                normalizeServiceStatus(
                    service
                ) === "RUNNING"
        ) ||
        mysqlServices[0] ||
        null;

    return {
        id:
            "mysql",
        name:
            "MySQL",
        installed:
            Boolean(
                versionOutput ||
                primaryService
            ),
        version:
            extractMySQLVersion(
                versionOutput
            ),
        executableAvailable:
            Boolean(
                versionOutput
            ),
        service: {
            installed:
                mysqlServices.length >
                    0,
            name:
                primaryService
                    ?.name ||
                null,
            status:
                primaryService
                    ? normalizeServiceStatus(
                        primaryService
                    )
                    : null
        },
        detectionNotes:
            mariaDBDetected
                ? [
                    "Se detectó una salida de MariaDB; no se contabilizó como MySQL."
                ]
                : []
    };

}

async function detectarRedis(
    services
) {

    const [
        availableServices,
        redisServerOutput,
        redisCliOutput
    ] = await Promise.all([
        Array.isArray(
            services
        )
            ? services
            : listarServicios(),
        executeFile(
            "redis-server",
            [
                "--version"
            ]
        ),
        executeFile(
            "redis-cli",
            [
                "--version"
            ]
        )
    ]);

    const outputs = [
        redisServerOutput,
        redisCliOutput
    ];

    const versionOutput =
        outputs.find(
            output =>
                Boolean(
                    extractRedisVersion(
                        output
                    )
                )
        ) ||
        null;

    const redisServices =
        availableServices.filter(
            service => {

                const serviceName =
                    String(
                        service.name ||
                        ""
                    )
                        .trim()
                        .toLowerCase()
                        .replace(
                            /\.service$/,
                            ""
                        );

                return (
                    serviceName ===
                        "redis" ||
                    serviceName ===
                        "redis-server"
                );

            }
        );

    const primaryService =
        redisServices.find(
            service =>
                normalizeServiceStatus(
                    service
                ) === "RUNNING"
        ) ||
        redisServices[0] ||
        null;

    return {
        id:
            "redis",
        name:
            "Redis",
        installed:
            Boolean(
                versionOutput ||
                primaryService
            ),
        version:
            extractRedisVersion(
                versionOutput
            ),
        executableAvailable:
            Boolean(
                versionOutput
            ),
        service: {
            installed:
                redisServices.length >
                    0,
            name:
                primaryService
                    ?.name ||
                null,
            status:
                primaryService
                    ? normalizeServiceStatus(
                        primaryService
                    )
                    : null
        }
    };

}

async function detectarNginx(
    services
) {

    const [
        availableServices,
        versionOutput
    ] = await Promise.all([
        Array.isArray(
            services
        )
            ? services
            : listarServicios(),
        executeFile(
            "nginx",
            [
                "-v"
            ]
        )
    ]);

    const nginxServices =
        availableServices.filter(
            service => {

                const serviceName =
                    String(
                        service.name ||
                        ""
                    )
                        .trim()
                        .toLowerCase();

                return (
                    serviceName ===
                        "nginx" ||
                    serviceName ===
                        "nginx.service"
                );

            }
        );

    const primaryService =
        nginxServices.find(
            service =>
                normalizeServiceStatus(
                    service
                ) === "RUNNING"
        ) ||
        nginxServices[0] ||
        null;

    const version =
        extractNginxVersion(
            versionOutput
        );

    return {
        id:
            "nginx",
        name:
            "Nginx",
        installed:
            Boolean(
                version ||
                primaryService
            ),
        version,
        executableAvailable:
            Boolean(
                version
            ),
        service: {
            installed:
                nginxServices.length >
                    0,
            name:
                primaryService
                    ?.name ||
                null,
            status:
                primaryService
                    ? normalizeServiceStatus(
                        primaryService
                    )
                    : null
        }
    };

}

async function detectarApache(
    services
) {

    const [
        availableServices,
        apache2Output,
        httpdOutput
    ] = await Promise.all([
        Array.isArray(
            services
        )
            ? services
            : listarServicios(),
        executeFile(
            "apache2",
            [
                "-v"
            ]
        ),
        executeFile(
            "httpd",
            [
                "-v"
            ]
        )
    ]);

    const outputs = [
        apache2Output,
        httpdOutput
    ];

    const versionOutput =
        outputs.find(
            output =>
                Boolean(
                    extractApacheVersion(
                        output
                    )
                )
        ) ||
        null;

    const apacheServices =
        availableServices.filter(
            service => {

                const serviceName =
                    String(
                        service.name ||
                        ""
                    )
                        .trim()
                        .toLowerCase()
                        .replace(
                            /\.service$/,
                            ""
                        );

                return (
                    serviceName ===
                        "apache2" ||
                    serviceName ===
                        "httpd" ||
                    serviceName ===
                        "apache2.4"
                );

            }
        );

    const primaryService =
        apacheServices.find(
            service =>
                normalizeServiceStatus(
                    service
                ) === "RUNNING"
        ) ||
        apacheServices[0] ||
        null;

    const version =
        extractApacheVersion(
            versionOutput
        );

    return {
        id:
            "apache",
        name:
            "Apache HTTP Server",
        installed:
            Boolean(
                version ||
                primaryService
            ),
        version,
        executableAvailable:
            Boolean(
                version
            ),
        service: {
            installed:
                apacheServices.length >
                    0,
            name:
                primaryService
                    ?.name ||
                null,
            status:
                primaryService
                    ? normalizeServiceStatus(
                        primaryService
                    )
                    : null
        }
    };

}

async function detectarPM2() {

    const versionOutput =
        await executeFile(
            "pm2",
            [
                "--version"
            ]
        );

    const version =
        extractPM2Version(
            versionOutput
        );

    return {
        id:
            "pm2",
        name:
            "PM2",
        installed:
            Boolean(
                version
            ),
        version,
        executableAvailable:
            Boolean(
                version
            ),
        service: {
            installed:
                false,
            name:
                null,
            status:
                null
        }
    };

}

async function detectarPython() {

    const outputs =
        await Promise.all([
            executeFile(
                "python",
                [
                    "--version"
                ]
            ),
            executeFile(
                "python3",
                [
                    "--version"
                ]
            ),
            executeFile(
                "py",
                [
                    "--version"
                ]
            )
        ]);

    const versionOutput =
        outputs.find(
            output =>
                Boolean(
                    extractPythonVersion(
                        output
                    )
                )
        ) ||
        null;

    const version =
        extractPythonVersion(
            versionOutput
        );

    return {
        id:
            "python",
        name:
            "Python",
        installed:
            Boolean(
                version
            ),
        version,
        executableAvailable:
            Boolean(
                version
            ),
        service: {
            installed:
                false,
            name:
                null,
            status:
                null
        }
    };

}

async function detectarJava() {

    const versionOutput =
        await executeFile(
            "java",
            [
                "-version"
            ]
        );

    const version =
        extractJavaVersion(
            versionOutput
        );

    return {
        id:
            "java",
        name:
            "Java",
        installed:
            Boolean(
                version
            ),
        version,
        executableAvailable:
            Boolean(
                version
            ),
        service: {
            installed:
                false,
            name:
                null,
            status:
                null
        }
    };

}

function createUnavailableTechnology(
    id,
    name
) {

    return {
        id,
        name,
        installed:
            false,
        version:
            null,
        executableAvailable:
            false,
        service: {
            installed:
                false,
            name:
                null,
            status:
                null
        }
    };

}

async function descubrirTecnologias() {

    const servicesPromise =
        listarServicios().catch(
            () => []
        );

    const services =
        await servicesPromise;

    const detectorDefinitions = [
        {
            id:
                "postgresql",
            name:
                "PostgreSQL",
            detect:
                () => detectarPostgreSQL(
                    services
                )
        },
        {
            id:
                "docker",
            name:
                "Docker",
            detect:
                () => detectarDocker(
                    services
                )
        },
        {
            id:
                "nodejs",
            name:
                "Node.js",
            detect:
                () => detectarNodeJS()
        },
        {
            id:
                "mysql",
            name:
                "MySQL",
            detect:
                () => detectarMySQL(
                    services
                )
        },
        {
            id:
                "redis",
            name:
                "Redis",
            detect:
                () => detectarRedis(
                    services
                )
        },
        {
            id:
                "nginx",
            name:
                "Nginx",
            detect:
                () => detectarNginx(
                    services
                )
        },
        {
            id:
                "apache",
            name:
                "Apache HTTP Server",
            detect:
                () => detectarApache(
                    services
                )
        },
        {
            id:
                "pm2",
            name:
                "PM2",
            detect:
                () => detectarPM2()
        },
        {
            id:
                "python",
            name:
                "Python",
            detect:
                () => detectarPython()
        },
        {
            id:
                "java",
            name:
                "Java",
            detect:
                () => detectarJava()
        }
    ];

    const results =
        await Promise.allSettled(
            detectorDefinitions.map(
                definition =>
                    definition.detect()
            )
        );

    return results.map(
        (result, index) => {

            const definition =
                detectorDefinitions[index];

            return result.status ===
                "fulfilled"
                ? result.value
                : createUnavailableTechnology(
                    definition.id,
                    definition.name
                );

        }
    );

}

module.exports = {
    detectarPostgreSQL,
    detectarDocker,
    detectarNodeJS,
    detectarMySQL,
    detectarRedis,
    detectarNginx,
    detectarApache,
    detectarPM2,
    detectarPython,
    detectarJava,
    descubrirTecnologias
};