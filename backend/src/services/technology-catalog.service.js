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

function getNodeJSInstallationGuide(
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
                false,
            title:
                "Instalar Node.js en Windows",
            description:
                "Ejecuta este comando desde PowerShell o Windows Terminal.",
            commands: [
                "winget install OpenJS.NodeJS.LTS --exact"
            ],
            notes: [
                "La instalación utiliza la versión LTS publicada por OpenJS.",
                "Cierra y vuelve a abrir la terminal para actualizar el PATH.",
                "Después de instalar Node.js, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Node.js con Homebrew",
            description:
                "Ejecuta el siguiente comando en la terminal.",
            commands: [
                "brew install node"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "Después de instalar Node.js, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Node.js con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install nodejs npm -y"
            ],
            notes: [
                "La versión será la disponible en los repositorios de la distribución.",
                "Después de instalar Node.js, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Node.js con DNF",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo dnf install nodejs npm -y"
            ],
            notes: [
                "La versión será la disponible en los repositorios de la distribución.",
                "Después de instalar Node.js, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Node.js con Pacman",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu nodejs npm"
            ],
            notes: [
                "Confirma los cambios propuestos por Pacman antes de continuar.",
                "Después de instalar Node.js, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Node.js en Alpine Linux",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo apk add nodejs npm"
            ],
            notes: [
                "La versión será la disponible en los repositorios de Alpine Linux.",
                "Después de instalar Node.js, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Node.js con Zypper",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo zypper install nodejs npm"
            ],
            notes: [
                "La versión será la disponible en los repositorios configurados.",
                "Después de instalar Node.js, actualiza nuevamente el descubrimiento de tecnologías."
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
            "Instalación manual requerida",
        description:
            "ServerHub todavía no dispone de una guía validada para instalar Node.js en esta combinación de sistema y gestor.",
        commands: [],
        notes: [
            "Consulta la documentación oficial de Node.js para esta distribución.",
            "No ejecutes comandos destinados a otra familia de sistema operativo."
        ]
    };

}

function getMySQLInstallationGuide(
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

    const detectionNotes =
        Array.isArray(
            technology?.detectionNotes
        )
            ? technology.detectionNotes
            : [];

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
                "Instalar MySQL en Windows",
            description:
                "Ejecuta este comando desde PowerShell o Windows Terminal con permisos de administrador.",
            commands: [
                "winget install --id Oracle.MySQL --exact"
            ],
            notes: [
                ...detectionNotes,
                "Después de instalar MySQL, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar MySQL con Homebrew",
            description:
                "Ejecuta el siguiente comando en la terminal.",
            commands: [
                "brew install mysql"
            ],
            notes: [
                ...detectionNotes,
                "Homebrew debe estar instalado previamente.",
                "Después de instalar MySQL, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar MySQL con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install mysql-server -y"
            ],
            notes: [
                ...detectionNotes,
                "La versión será la disponible en los repositorios de la distribución.",
                "Después de instalar MySQL, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar MySQL con DNF",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo dnf install mysql-server -y"
            ],
            notes: [
                ...detectionNotes,
                "La versión será la disponible en los repositorios configurados.",
                "Después de instalar MySQL, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar MySQL con Pacman",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu mysql"
            ],
            notes: [
                ...detectionNotes,
                "Confirma los cambios propuestos por Pacman antes de continuar.",
                "Después de instalar MySQL, actualiza nuevamente el descubrimiento de tecnologías."
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
            "Instalación manual requerida",
        description:
            "ServerHub todavía no dispone de una guía validada para instalar MySQL en esta combinación de sistema y gestor.",
        commands: [],
        notes: [
            ...detectionNotes,
            "Consulta la documentación oficial de MySQL para esta distribución.",
            "No ejecutes comandos de MariaDB ni instrucciones destinadas a otra distribución."
        ]
    };

}

function getRedisInstallationGuide(
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
                "Instalar Redis con Homebrew",
            description:
                "Ejecuta los siguientes comandos en la terminal.",
            commands: [
                "brew install redis",
                "brew services start redis"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "Después de instalar Redis, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Redis con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install redis-server -y",
                "sudo systemctl enable redis-server",
                "sudo systemctl start redis-server"
            ],
            notes: [
                "Redis puede utilizar el nombre redis-server en sistemas basados en Debian.",
                "Después de instalar Redis, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Redis con DNF",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo dnf install redis -y",
                "sudo systemctl enable redis",
                "sudo systemctl start redis"
            ],
            notes: [
                "Verifica el nombre del servicio si la distribución utiliza redis-server.",
                "Después de instalar Redis, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Redis con Pacman",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu redis",
                "sudo systemctl enable redis",
                "sudo systemctl start redis"
            ],
            notes: [
                "Confirma los cambios propuestos por Pacman antes de continuar.",
                "Después de instalar Redis, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Redis en Alpine Linux",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apk add redis",
                "sudo rc-update add redis default",
                "sudo rc-service redis start"
            ],
            notes: [
                "Alpine Linux utiliza OpenRC en lugar de systemd.",
                "Después de instalar Redis, actualiza nuevamente el descubrimiento de tecnologías."
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
            "Instalación manual requerida",
        description:
            "ServerHub todavía no dispone de una guía validada para instalar Redis en esta combinación de sistema y gestor.",
        commands: [],
        notes: [
            "Redis no está disponible de forma nativa en todas las versiones de Windows.",
            "Consulta la documentación oficial de Redis para esta distribución.",
            "No ejecutes comandos destinados a otra familia de sistema operativo."
        ]
    };

}

function getNginxInstallationGuide(
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
                "Instalar Nginx con Homebrew",
            description:
                "Ejecuta los siguientes comandos en la terminal.",
            commands: [
                "brew install nginx",
                "brew services start nginx"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "Después de instalar Nginx, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Nginx con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install nginx -y",
                "sudo systemctl enable nginx",
                "sudo systemctl start nginx"
            ],
            notes: [
                "La versión será la disponible en los repositorios de la distribución.",
                "Después de instalar Nginx, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Nginx con DNF",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo dnf install nginx -y",
                "sudo systemctl enable nginx",
                "sudo systemctl start nginx"
            ],
            notes: [
                "La versión será la disponible en los repositorios configurados.",
                "Después de instalar Nginx, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Nginx con Pacman",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu nginx",
                "sudo systemctl enable nginx",
                "sudo systemctl start nginx"
            ],
            notes: [
                "Confirma los cambios propuestos por Pacman antes de continuar.",
                "Después de instalar Nginx, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Nginx en Alpine Linux",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apk add nginx",
                "sudo rc-update add nginx default",
                "sudo rc-service nginx start"
            ],
            notes: [
                "Alpine Linux utiliza OpenRC en lugar de systemd.",
                "Después de instalar Nginx, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Nginx con Zypper",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo zypper refresh",
                "sudo zypper install nginx",
                "sudo systemctl enable nginx",
                "sudo systemctl start nginx"
            ],
            notes: [
                "La versión será la disponible en los repositorios configurados.",
                "Después de instalar Nginx, actualiza nuevamente el descubrimiento de tecnologías."
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
            "Instalación manual requerida",
        description:
            "ServerHub todavía no dispone de una guía validada para instalar Nginx en esta combinación de sistema y gestor.",
        commands: [],
        notes: [
            "En Windows, ServerHub no dispone de una guía validada para instalar Nginx mediante winget.",
            "Consulta la documentación oficial de Nginx para esta distribución.",
            "No ejecutes comandos destinados a otra familia de sistema operativo."
        ]
    };

}

function getApacheInstallationGuide(
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
                "Instalar Apache HTTP Server con Homebrew",
            description:
                "Ejecuta los siguientes comandos en la terminal.",
            commands: [
                "brew install httpd",
                "brew services start httpd"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "Después de instalar Apache HTTP Server, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Apache HTTP Server con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install apache2 -y",
                "sudo systemctl enable apache2",
                "sudo systemctl start apache2"
            ],
            notes: [
                "En sistemas Debian, Ubuntu y derivados el servicio suele llamarse apache2.",
                "Después de instalar Apache HTTP Server, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Apache HTTP Server con DNF",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo dnf install httpd -y",
                "sudo systemctl enable httpd",
                "sudo systemctl start httpd"
            ],
            notes: [
                "En sistemas Fedora y derivados el servicio suele llamarse httpd.",
                "Después de instalar Apache HTTP Server, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Apache HTTP Server con Pacman",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu apache",
                "sudo systemctl enable httpd",
                "sudo systemctl start httpd"
            ],
            notes: [
                "Confirma los cambios propuestos por Pacman antes de continuar.",
                "Después de instalar Apache HTTP Server, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Apache HTTP Server en Alpine Linux",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apk add apache2",
                "sudo rc-update add apache2 default",
                "sudo rc-service apache2 start"
            ],
            notes: [
                "Alpine Linux utiliza OpenRC en lugar de systemd.",
                "Después de instalar Apache HTTP Server, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Apache HTTP Server con Zypper",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo zypper refresh",
                "sudo zypper install apache2",
                "sudo systemctl enable apache2",
                "sudo systemctl start apache2"
            ],
            notes: [
                "La versión será la disponible en los repositorios configurados.",
                "Después de instalar Apache HTTP Server, actualiza nuevamente el descubrimiento de tecnologías."
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
            "Instalación manual requerida",
        description:
            "ServerHub todavía no dispone de una guía validada para instalar Apache HTTP Server en esta combinación de sistema y gestor.",
        commands: [],
        notes: [
            "En Windows, ServerHub no dispone de una guía validada para instalar Apache HTTP Server mediante winget.",
            "Consulta la documentación oficial de Apache HTTP Server para esta distribución.",
            "No ejecutes comandos destinados a otra familia de sistema operativo."
        ]
    };

}

function getPM2InstallationGuide(
    operatingSystem,
    technology,
    technologies
) {

    if (
        technology?.installed
    ) {
        return null;
    }

    const nodeJS =
        Array.isArray(
            technologies
        )
            ? technologies.find(
                item =>
                    item.id ===
                    "nodejs"
            )
            : null;

    if (
        !nodeJS?.installed
    ) {

        return {
            supported: false,
            method:
                "npm",
            requiresAdministrator:
                null,
            title:
                "Node.js es necesario para instalar PM2",
            description:
                "ServerHub no recomienda instalar PM2 hasta confirmar que Node.js está instalado en el servidor.",
            commands: [],
            notes: [
                "Instala Node.js y vuelve a ejecutar el descubrimiento de tecnologías.",
                "PM2 se instala mediante el gestor de paquetes npm incluido con Node.js.",
                "No ejecutes la instalación de PM2 si npm todavía no está disponible."
            ]
        };

    }

    return {
        supported: true,
        method:
            "npm",
        requiresAdministrator:
            null,
        title:
            "Instalar PM2 con npm",
        description:
            "Ejecuta el siguiente comando en la terminal del servidor.",
        commands: [
            "npm install --global pm2"
        ],
        notes: [
            "Node.js y npm deben estar disponibles antes de ejecutar este comando.",
            "Los permisos requeridos dependen de la configuración de npm del usuario.",
            "Después de instalar PM2, actualiza nuevamente el descubrimiento de tecnologías."
        ]
    };

}

function getPythonInstallationGuide(
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
                false,
            title:
                "Instalar Python en Windows",
            description:
                "Ejecuta este comando desde PowerShell o Windows Terminal.",
            commands: [
                "winget install --id Python.Python.3.13 --exact"
            ],
            notes: [
                "La instalación incluye Python y el lanzador py de Windows.",
                "Cierra y vuelve a abrir la terminal para actualizar el PATH.",
                "Después de instalar Python, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Python con Homebrew",
            description:
                "Ejecuta el siguiente comando en la terminal.",
            commands: [
                "brew install python"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "Después de instalar Python, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Python con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install python3 python3-pip -y"
            ],
            notes: [
                "La versión será la disponible en los repositorios de la distribución.",
                "Después de instalar Python, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Python con DNF",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo dnf install python3 python3-pip -y"
            ],
            notes: [
                "La versión será la disponible en los repositorios configurados.",
                "Después de instalar Python, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Python con Pacman",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu python python-pip"
            ],
            notes: [
                "Confirma los cambios propuestos por Pacman antes de continuar.",
                "Después de instalar Python, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Python en Alpine Linux",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo apk add python3 py3-pip"
            ],
            notes: [
                "La versión será la disponible en los repositorios de Alpine Linux.",
                "Después de instalar Python, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Python con Zypper",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo zypper install python3 python3-pip"
            ],
            notes: [
                "La versión será la disponible en los repositorios configurados.",
                "Después de instalar Python, actualiza nuevamente el descubrimiento de tecnologías."
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
            "Instalación manual requerida",
        description:
            "ServerHub todavía no dispone de una guía validada para instalar Python en esta combinación de sistema y gestor.",
        commands: [],
        notes: [
            "Consulta la documentación oficial de Python para esta distribución.",
            "No ejecutes comandos destinados a otra familia de sistema operativo."
        ]
    };

}

function getJavaInstallationGuide(
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
                false,
            title:
                "Instalar Java en Windows",
            description:
                "Ejecuta este comando desde PowerShell o Windows Terminal.",
            commands: [
                "winget install --id Microsoft.OpenJDK.21 --exact"
            ],
            notes: [
                "La guía utiliza Microsoft Build of OpenJDK sin asumir un proveedor ya instalado.",
                "Cierra y vuelve a abrir la terminal para actualizar el PATH.",
                "Después de instalar Java, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Java con Homebrew",
            description:
                "Ejecuta el siguiente comando en la terminal.",
            commands: [
                "brew install openjdk"
            ],
            notes: [
                "Homebrew debe estar instalado previamente.",
                "La guía instala OpenJDK sin asumir un proveedor concreto.",
                "Después de instalar Java, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Java con APT",
            description:
                "Ejecuta los siguientes comandos en la terminal del servidor.",
            commands: [
                "sudo apt update",
                "sudo apt install default-jre -y"
            ],
            notes: [
                "La distribución elegirá el runtime Java predeterminado disponible en sus repositorios.",
                "Después de instalar Java, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Java con DNF",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo dnf install java-21-openjdk -y"
            ],
            notes: [
                "La guía utiliza OpenJDK y no asume un proveedor propietario.",
                "Después de instalar Java, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Java con Pacman",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo pacman -Syu jre-openjdk"
            ],
            notes: [
                "Confirma los cambios propuestos por Pacman antes de continuar.",
                "La guía instala el runtime OpenJDK predeterminado.",
                "Después de instalar Java, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Java en Alpine Linux",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo apk add openjdk17-jre"
            ],
            notes: [
                "La guía utiliza el runtime OpenJDK disponible para Alpine Linux.",
                "Después de instalar Java, actualiza nuevamente el descubrimiento de tecnologías."
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
                "Instalar Java con Zypper",
            description:
                "Ejecuta el siguiente comando en la terminal del servidor.",
            commands: [
                "sudo zypper install java-17-openjdk"
            ],
            notes: [
                "La guía utiliza OpenJDK y no asume un proveedor propietario.",
                "Después de instalar Java, actualiza nuevamente el descubrimiento de tecnologías."
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
            "Instalación manual requerida",
        description:
            "ServerHub todavía no dispone de una guía validada para instalar Java en esta combinación de sistema y gestor.",
        commands: [],
        notes: [
            "Consulta la documentación oficial de Java para esta distribución.",
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

        if (
            technology.id ===
                "nodejs"
        ) {

            return {
                ...technology,
                installation:
                    getNodeJSInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        if (
            technology.id ===
                "mysql"
        ) {

            return {
                ...technology,
                installation:
                    getMySQLInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        if (
            technology.id ===
                "redis"
        ) {

            return {
                ...technology,
                installation:
                    getRedisInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        if (
            technology.id ===
                "nginx"
        ) {

            return {
                ...technology,
                installation:
                    getNginxInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        if (
            technology.id ===
                "apache"
        ) {

            return {
                ...technology,
                installation:
                    getApacheInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        if (
            technology.id ===
                "pm2"
        ) {

            return {
                ...technology,
                installation:
                    getPM2InstallationGuide(
                        operatingSystem,
                        technology,
                        technologies
                    )
            };

        }

        if (
            technology.id ===
                "python"
        ) {

            return {
                ...technology,
                installation:
                    getPythonInstallationGuide(
                        operatingSystem,
                        technology
                    )
            };

        }

        if (
            technology.id ===
                "java"
        ) {

            return {
                ...technology,
                installation:
                    getJavaInstallationGuide(
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