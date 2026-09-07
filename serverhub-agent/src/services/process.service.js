const { exec } = require("child_process");

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

module.exports = {
    listarProcesos,
    matarProceso
};