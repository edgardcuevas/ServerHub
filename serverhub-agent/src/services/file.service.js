const fs = require("fs");
const path = require("path");

async function listarArchivos(
    currentPath
) {

    const targetPath =
        currentPath ||
        (
            process.platform === "win32"
                ? "C:\\"
                : "/"
        );

    const entries =
        await fs.promises.readdir(
            targetPath
        );

    const items = [];

    for (const entry of entries) {

        try {

            const fullPath =
                path.join(
                    targetPath,
                    entry
                );

            const stats =
                await fs.promises.stat(
                    fullPath
                );

            items.push({
                name: entry,
                path: fullPath,
                type:
                    stats.isDirectory()
                        ? "directory"
                        : "file",
                size: stats.size
            });

        } catch {

            continue;

        }

    }

    return {
        path: targetPath,
        items
    };

}

async function leerArchivo(
    filePath
) {

    if (
        !filePath ||
        typeof filePath !== "string"
    ) {
        throw new Error(
            "Ruta de archivo requerida"
        );
    }

    const stats =
        await fs.promises.stat(
            filePath
        );

    if (
        !stats.isFile()
    ) {
        throw new Error(
            "La ruta indicada no es un archivo"
        );
    }

    const buffer =
    await fs.promises.readFile(
        filePath
    );

return {
        fileName:
            path.basename(
                filePath
            ),
        filePath,
        size:
            stats.size,
        content:
            buffer.toString(
                "base64"
            )
    };

}

async function escribirArchivo(
    filePath,
    content
) {

    if (
        !filePath ||
        typeof filePath !== "string"
    ) {
        throw new Error(
            "Ruta de archivo requerida"
        );
    }

    if (
    typeof content !== "string"
) {
    throw new Error(
        "Contenido requerido"
    );
}

    const buffer =
        Buffer.from(
            content,
            "base64"
        );

    await fs.promises.writeFile(
        filePath,
        buffer
    );

    const stats =
        await fs.promises.stat(
            filePath
        );

    return {
        success: true,
        filePath,
        size: stats.size
    };

}

async function crearCarpeta(
    folderPath
) {

    if (
        !folderPath ||
        typeof folderPath !== "string"
    ) {
        throw new Error(
            "Ruta de carpeta requerida"
        );
    }

    await fs.promises.mkdir(
        folderPath,
        {
            recursive: true
        }
    );

    return {
        success: true,
        path: folderPath
    };

}

async function renombrar(
    oldPath,
    newPath
) {

    if (
        !oldPath ||
        typeof oldPath !== "string"
    ) {
        throw new Error(
            "Ruta origen requerida"
        );
    }

    if (
        !newPath ||
        typeof newPath !== "string"
    ) {
        throw new Error(
            "Ruta destino requerida"
        );
    }

    await fs.promises.rename(
        oldPath,
        newPath
    );

    return {
        success: true,
        oldPath,
        newPath
    };

}

async function eliminar(
    targetPath
) {

    if (
        !targetPath ||
        typeof targetPath !== "string"
    ) {
        throw new Error(
            "Ruta requerida"
        );
    }

    const stats =
        await fs.promises.stat(
            targetPath
        );

    if (
        stats.isDirectory()
    ) {

        await fs.promises.rm(
            targetPath,
            {
                recursive: true,
                force: true
            }
        );

    } else {

        await fs.promises.unlink(
            targetPath
        );

    }

    return {
        success: true,
        path: targetPath
    };

}

async function mover(
    sourcePath,
    destinationPath
) {

    if (
        !sourcePath ||
        typeof sourcePath !== "string"
    ) {
        throw new Error(
            "Ruta origen requerida"
        );
    }

    if (
        !destinationPath ||
        typeof destinationPath !== "string"
    ) {
        throw new Error(
            "Ruta destino requerida"
        );
    }

    await fs.promises.rename(
        sourcePath,
        destinationPath
    );

    return {
        success: true,
        sourcePath,
        destinationPath
    };

}

module.exports = {
    listarArchivos,
    leerArchivo,
    escribirArchivo,
    crearCarpeta,
    renombrar,
    eliminar,
    mover
};
