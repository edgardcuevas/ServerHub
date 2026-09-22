const os = require("os");
const { exec } = require("child_process");
const si =
    require("systeminformation");

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

async function obtenerSistemaOperativo() {

    const osInfo =
        await si.osInfo();

    const platform =
        osInfo.platform ||
        process.platform;

    const distro =
        osInfo.distro ||
        obtenerNombreSistema();

    const release =
        osInfo.release ||
        os.release();

    const codename =
        osInfo.codename ||
        null;

    const architecture =
        osInfo.arch ||
        os.arch();

    const normalizedPlatform =
        String(platform)
            .trim()
            .toLowerCase();

    const normalizedDistro =
        String(distro)
            .trim()
            .toLowerCase();

    let family =
        "unknown";

    let packageManager =
        null;

    if (
        normalizedPlatform === "win32" ||
        normalizedPlatform === "windows" ||
        normalizedDistro.includes(
            "windows"
        )
    ) {

        family =
            "windows";

        packageManager =
            "winget";

    } else if (
        normalizedPlatform === "darwin" ||
        normalizedPlatform === "macos" ||
        normalizedDistro.includes(
            "macos"
        ) ||
        normalizedDistro.includes(
            "mac os"
        )
    ) {

        family =
            "macos";

        packageManager =
            "brew";

    } else if (
        normalizedDistro.includes(
            "linux mint"
        ) ||
        normalizedDistro === "mint"
    ) {

        family =
            "linux-mint";

        packageManager =
            "apt";

    } else if (
        normalizedDistro.includes(
            "pop!_os"
        ) ||
        normalizedDistro.includes(
            "pop! os"
        ) ||
        normalizedDistro.includes(
            "pop os"
        )
    ) {

        family =
            "pop-os";

        packageManager =
            "apt";

    } else if (
        normalizedDistro.includes(
            "kali"
        )
    ) {

        family =
            "kali";

        packageManager =
            "apt";

    } else if (
        normalizedDistro.includes(
            "raspbian"
        ) ||
        normalizedDistro.includes(
            "raspberry pi os"
        )
    ) {

        family =
            "raspberry-pi-os";

        packageManager =
            "apt";

    } else if (
        normalizedDistro.includes(
            "ubuntu"
        )
    ) {

        family =
            "ubuntu";

        packageManager =
            "apt";

    } else if (
        normalizedDistro.includes(
            "debian"
        )
    ) {

        family =
            "debian";

        packageManager =
            "apt";

    } else if (
        normalizedDistro.includes(
            "rocky"
        )
    ) {

        family =
            "rocky";

        packageManager =
            "dnf";

    } else if (
        normalizedDistro.includes(
            "almalinux"
        ) ||
        normalizedDistro.includes(
            "alma linux"
        )
    ) {

        family =
            "almalinux";

        packageManager =
            "dnf";

    } else if (
        normalizedDistro.includes(
            "oracle linux"
        )
    ) {

        family =
            "oracle-linux";

        packageManager =
            "dnf";

    } else if (
        normalizedDistro.includes(
            "amazon linux"
        )
    ) {

        family =
            "amazon-linux";

        packageManager =
            "dnf";

    } else if (
        normalizedDistro.includes(
            "red hat"
        ) ||
        normalizedDistro.includes(
            "rhel"
        )
    ) {

        family =
            "rhel";

        packageManager =
            "dnf";

    } else if (
        normalizedDistro.includes(
            "centos"
        )
    ) {

        family =
            "centos";

        packageManager =
            "dnf";

    } else if (
        normalizedDistro.includes(
            "fedora"
        )
    ) {

        family =
            "fedora";

        packageManager =
            "dnf";

    } else if (
        normalizedDistro.includes(
            "manjaro"
        )
    ) {

        family =
            "manjaro";

        packageManager =
            "pacman";

    } else if (
        normalizedDistro.includes(
            "endeavouros"
        ) ||
        normalizedDistro.includes(
            "endeavour os"
        )
    ) {

        family =
            "endeavouros";

        packageManager =
            "pacman";

    } else if (
        normalizedDistro.includes(
            "arch linux"
        ) ||
        normalizedDistro === "arch"
    ) {

        family =
            "arch";

        packageManager =
            "pacman";

    } else if (
        normalizedDistro.includes(
            "alpine"
        )
    ) {

        family =
            "alpine";

        packageManager =
            "apk";

    } else if (
        normalizedDistro.includes(
            "opensuse"
        ) ||
        normalizedDistro.includes(
            "open suse"
        )
    ) {

        family =
            "opensuse";

        packageManager =
            "zypper";

    } else if (
        normalizedDistro.includes(
            "suse linux enterprise"
        ) ||
        normalizedDistro.includes(
            "sles"
        ) ||
        normalizedDistro.includes(
            "suse"
        )
    ) {

        family =
            "suse";

        packageManager =
            "zypper";

    } else if (
        normalizedDistro.includes(
            "void linux"
        ) ||
        normalizedDistro === "void"
    ) {

        family =
            "void-linux";

        packageManager =
            "xbps";

    } else if (
        normalizedDistro.includes(
            "gentoo"
        )
    ) {

        family =
            "gentoo";

        packageManager =
            "portage";

    } else if (
        normalizedDistro.includes(
            "slackware"
        )
    ) {

        family =
            "slackware";

        packageManager =
            "slackpkg";

    } else if (
        normalizedPlatform === "linux"
    ) {

        family =
            "linux";

        packageManager =
            null;

    }

    return {
        platform,
        family,
        distro,
        release,
        codename,
        architecture,
        packageManager
    };

}


module.exports = {
    obtenerInformacionSistema,
    reiniciarServidor,
    obtenerSistemaOperativo
};