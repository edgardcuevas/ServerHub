function getPostgreSQLInstallationGuide(
    operatingSystem,
    technology
) {

    if (
        technology?.installed
    ) {
        return null;
    }

    const family =
        operatingSystem?.family;

    const packageManager =
        operatingSystem?.packageManager;

    if (
        family === "windows" &&
        packageManager === "winget"
    ) {

        return {
            supported: true,
            method:
                "winget",
            requiresAdministrator:
                true,
            title:
                "Instalar PostgreSQL en Windows",
            description:
                "Ejecuta estos comandos desde PowerShell o Windows Terminal con permisos de administrador.",
            commands: [
                "winget search PostgreSQL.PostgreSQL",
                "winget install --id PostgreSQL.PostgreSQL.18 --exact"
            ],
            notes: [
                "El primer comando permite comprobar las versiones disponibles.",
                "La instalación puede solicitar la aprobación de permisos administrativos.",
                "Después de instalar PostgreSQL, actualiza nuevamente el descubrimiento de tecnologías."
            ]
        };

    }

    if (
        packageManager === "apt"
    ) {

        return {
            supported: true,
            method:
                "apt",
            requiresAdministrator:
                true,
            title:
                "Instalar PostgreSQL con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install postgresql postgresql-contrib -y",
                "sudo systemctl enable postgresql",
                "sudo systemctl start postgresql"
            ],
            notes: [
                "La versión instalada será la disponible en los repositorios de la distribución.",
                "Después de instalar PostgreSQL, actualiza nuevamente el descubrimiento de tecnologías."
            ]
        };

    }

    if (
        packageManager === "dnf"
    ) {

        return {
            supported: true,
            method:
                "dnf",
            requiresAdministrator:
                true,
            title:
                "Instalar PostgreSQL con DNF",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo dnf install postgresql-server postgresql-contrib -y",
                "sudo postgresql-setup --initdb",
                "sudo systemctl enable postgresql",
                "sudo systemctl start postgresql"
            ],
            notes: [
                "El comando de inicialización puede variar según la distribución y la versión instalada.",
                "Verifica el nombre exacto del servicio si systemctl no encuentra postgresql."
            ]
        };

    }

    if (
        packageManager === "pacman"
    ) {

        return {
            supported: true,
            method:
                "pacman",
            requiresAdministrator:
                true,
            title:
                "Instalar PostgreSQL con Pacman",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu postgresql",
                "sudo -iu postgres initdb -D /var/lib/postgres/data",
                "sudo systemctl enable postgresql",
                "sudo systemctl start postgresql"
            ],
            notes: [
                "Confirma la ubicación del directorio de datos antes de inicializar PostgreSQL.",
                "No ejecutes initdb si ya existe un clúster configurado."
            ]
        };

    }

    if (
        packageManager === "apk"
    ) {

        return {
            supported: true,
            method:
                "apk",
            requiresAdministrator:
                true,
            title:
                "Instalar PostgreSQL en Alpine Linux",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apk update",
                "sudo apk add postgresql postgresql-contrib",
                "sudo rc-update add postgresql",
                "sudo rc-service postgresql setup",
                "sudo rc-service postgresql start"
            ],
            notes: [
                "Alpine Linux utiliza OpenRC en lugar de systemd.",
                "No ejecutes la configuración inicial si PostgreSQL ya tiene un directorio de datos."
            ]
        };

    }

    if (
        packageManager === "zypper"
    ) {

        return {
            supported: true,
            method:
                "zypper",
            requiresAdministrator:
                true,
            title:
                "Instalar PostgreSQL con Zypper",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo zypper refresh",
                "sudo zypper install postgresql postgresql-server",
                "sudo systemctl enable postgresql",
                "sudo systemctl start postgresql"
            ],
            notes: [
                "Puede ser necesario inicializar el clúster antes de iniciar el servicio.",
                "El procedimiento exacto puede variar entre openSUSE y SUSE Linux Enterprise."
            ]
        };

    }

    if (
        family === "macos" &&
        packageManager === "brew"
    ) {

        return {
            supported: true,
            method:
                "brew",
            requiresAdministrator:
                false,
            title:
                "Instalar PostgreSQL con Homebrew",
            description:
                "Ejecuta los siguientes comandos en la terminal.",
            commands: [
                "brew update",
                "brew install postgresql",
                "brew services start postgresql"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "Después de la instalación, actualiza nuevamente el descubrimiento."
            ]
        };

    }

    return {
        supported: false,
        method:
            null,
        requiresAdministrator:
            null,
        title:
            "Instalación manual requerida",
        description:
            "ServerHub detectó el sistema operativo, pero todavía no dispone de una guía segura para instalar PostgreSQL en esta distribución.",
        commands: [],
        notes: [
            "Consulta la documentación oficial de PostgreSQL para esta distribución.",
            "No ejecutes comandos destinados a otra familia de sistema operativo."
        ]
    };

}

function enrichTechnologyDiscovery(
    discovery
) {

    if (
        !discovery ||
        typeof discovery !== "object"
    ) {
        return discovery;
    }

    const operatingSystem =
        discovery.operatingSystem;

    const technologies =
        Array.isArray(
            discovery.technologies
        )
            ? discovery.technologies
            : [];

    return {
        ...discovery,
        technologies:
            technologies.map(
    technology => {

        if (
            technology.id ===
                "postgresql"
        ) {

            return {
                ...technology,
                installation:
                    getPostgreSQLInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        if (
            technology.id ===
                "docker"
        ) {

            return {
                ...technology,
                installation:
                    getDockerInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        return technology;

    }
)
    };

}

function getDockerInstallationGuide(
    operatingSystem,
    technology
) {

    if (
        technology?.installed
    ) {
        return null;
    }

    const family =
        operatingSystem?.family;

    const packageManager =
        operatingSystem?.packageManager;

    if (
        family === "windows" &&
        packageManager === "winget"
    ) {

        return {
            supported: true,
            method:
                "winget",
            requiresAdministrator:
                true,
            title:
                "Instalar Docker Desktop en Windows",
            description:
                "Ejecuta estos comandos desde PowerShell o Windows Terminal. Verifica primero que WSL 2 y la virtualización estén disponibles.",
            commands: [
                "wsl --status",
                "winget install --id Docker.DockerDesktop --exact"
            ],
            notes: [
                "Docker Desktop utiliza WSL 2 como opción predeterminada en la mayoría de instalaciones de Windows.",
                "Puede ser necesario reiniciar Windows después de instalar o actualizar WSL.",
                "Después de la instalación, inicia Docker Desktop y espera hasta que el motor esté disponible.",
                "Actualiza nuevamente el descubrimiento de tecnologías desde ServerHub."
            ]
        };

    }

    if (
        family === "macos" &&
        packageManager === "brew"
    ) {

        return {
            supported: true,
            method:
                "brew",
            requiresAdministrator:
                false,
            title:
                "Instalar Docker Desktop en macOS",
            description:
                "Ejecuta el siguiente comando desde la terminal.",
            commands: [
                "brew install --cask docker"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "Después de instalar, abre Docker Desktop para iniciar el motor.",
                "Actualiza nuevamente el descubrimiento de tecnologías desde ServerHub."
            ]
        };

    }

    return {
        supported: false,
        method:
            packageManager ||
            null,
        requiresAdministrator:
            null,
        title:
            "Instalación guiada todavía no disponible",
        description:
            "ServerHub detectó el sistema operativo, pero todavía no dispone de una guía validada para instalar Docker en esta distribución.",
        commands: [],
        notes: [
            "Docker Engine utiliza procedimientos diferentes según la distribución Linux.",
            "No ejecutes comandos destinados a una distribución diferente.",
            "Consulta la documentación oficial de Docker Engine para la distribución detectada."
        ]
    };

}

module.exports = {
    enrichTechnologyDiscovery
};