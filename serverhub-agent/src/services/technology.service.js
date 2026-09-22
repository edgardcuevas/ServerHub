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

async function detectarPostgreSQL() {

    const [
        services,
        versionOutput
    ] = await Promise.all([
        listarServicios(),
        executeFile(
            "psql",
            [
                "--version"
            ]
        )
    ]);

    const postgreSQLServices =
        services.filter(
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


async function detectarDocker() {

    const [
        services,
        versionOutput
    ] = await Promise.all([
        listarServicios(),
        executeFile(
            "docker",
            [
                "--version"
            ]
        )
    ]);

    const dockerServices =
        services.filter(
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

module.exports = {
    detectarPostgreSQL,
    detectarDocker
};