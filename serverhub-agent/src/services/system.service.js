const os = require("os");
const { exec } = require("child_process");

function obtenerNombreSistema() {

    const plataforma = os.platform();

    if (plataforma === "win32") {
        return "Windows";
    }

    if (plataforma === "linux") {
        return "Linux";
    }

    if (plataforma === "darwin") {
        return "macOS";
    }

    return plataforma;

}

function obtenerInformacionSistema(versionAgente) {

    const horasTotales = Math.floor(
        os.uptime() / 3600
    );

    const dias = Math.floor(
        horasTotales / 24
    );

    const horas = horasTotales % 24;

    return {
        hostname: os.hostname(),
        plataforma: obtenerNombreSistema(),
        arquitectura: os.arch(),
        tiempoEncendido: `${dias} días y ${horas} horas`,
        versionAgente
    };

}

function reiniciarServidor() {

    return new Promise(
        (resolve, reject) => {

            let comando;

            if (
                process.platform === "win32"
            ) {

                comando =
                    "shutdown /r /t 0";

            } else {

                comando =
                    "reboot";

            }

            resolve({
                success: true,
                action: "REBOOT_SERVER"
            });

            setTimeout(() => {

                exec(
                    comando,
                    () => {}
                );

            }, 1000);

        }
    );

}


module.exports = {
    obtenerInformacionSistema,
    reiniciarServidor
};