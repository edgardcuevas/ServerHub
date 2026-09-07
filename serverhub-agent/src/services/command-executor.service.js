const {
    listarProcesos,
    matarProceso
} = require(
    "./process.service"
);

const {
    listarServicios,
    iniciarServicio,
    detenerServicio,
    reiniciarServicio
} = require(
    "./service.service"
);

const {
    listarArchivos,
    leerArchivo,
    escribirArchivo,
    crearCarpeta,
    renombrar,
    eliminar,
    mover
} = require(
    "./file.service"
);

const {
    obtenerInformacionSistema,
    reiniciarServidor
} = require(
    "./system.service"
);

async function executeCommand(
    command
) {

    switch (
        command.command_type
    ) {

        case "PING":

            return {
                message: "PONG"
            };

        case "LIST_PROCESSES":

            return {
                processes:
                    await listarProcesos()
            };

        case "KILL_PROCESS":

    return await matarProceso(
        command.payload?.pid
    );


        case "LIST_SERVICES":

            return {
                services:
                    await listarServicios()
            };

        case "START_SERVICE":

            return await iniciarServicio(
                command.payload?.serviceName
            );

        case "STOP_SERVICE":

    return await detenerServicio(
        command.payload?.serviceName
    );

        case "RESTART_SERVICE":

    return await reiniciarServicio(
        command.payload?.serviceName
    );

        case "FILE_BROWSER":

    return await listarArchivos(
        command.payload?.path
    );

        case "DOWNLOAD_FILE":

    return await leerArchivo(
        command.payload?.path
    );

        case "UPLOAD_FILE":

    return await escribirArchivo(
        command.payload?.path,
        command.payload?.content
    );

        case "CREATE_FOLDER":

    return await crearCarpeta(
        command.payload?.path
    );

        case "RENAME_FILE":

    return await renombrar(
        command.payload?.oldPath,
        command.payload?.newPath
    );

        case "DELETE_FILE":

    return await eliminar(
        command.payload?.path
    );

        case "MOVE_FILE":

    return await mover(
        command.payload?.sourcePath,
        command.payload?.destinationPath
    );

        case "REBOOT_SERVER":

    return await reiniciarServidor();


        default:

            throw new Error(
                `Comando no soportado: ${command.command_type}`
            );

    }

}

module.exports = {
    executeCommand
};