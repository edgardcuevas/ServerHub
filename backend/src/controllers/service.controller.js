const serverService =
    require(
        "../services/server.service"
    );

const {
    createCommand
} = require(
    "../services/command.service"
);

async function getServiceDetails(
    req,
    res
) {

    try {

        const {
            serviceName
        } = req.body;

        if (
            typeof serviceName !==
                "string" ||
            !serviceName.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Nombre de servicio requerido"
            });
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
            return res.status(400).json({
                success: false,
                message:
                    "Nombre de servicio inválido"
            });
        }

        const agent =
            await serverService
                .getServerAgent(
                    req.user.id,
                    req.params.id
                );

        const command =
            await createCommand(
                agent.id,
                "GET_SERVICE_DETAILS",
                {
                    serviceName:
                        normalizedServiceName
                }
            );

        return res.status(201).json({
            success: true,
            command
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message:
                error.message
        });

    }

}

module.exports = {
    getServiceDetails
};