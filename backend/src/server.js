const app = require("./app");
const { PORT } = require("./config/env");
const pool = require("./config/db");
const {
    startMetricsCleanupJob
} = require(
    "./jobs/metrics-cleanup.job"
);

const {
    startAgentOfflineJob
} = require(
    "./jobs/agent-offline.job"
);

const {
    startAdminSessionCleanupJob
} = require(
    "./jobs/admin-session-cleanup.job"
);

async function startServer() {
    try {
        // Verificar conexión con PostgreSQL
        await pool.query("SELECT NOW()");

        console.log("✅ Base de datos conectada");
        startMetricsCleanupJob();
        startAgentOfflineJob();
        startAdminSessionCleanupJob();

        // Iniciar servidor Express
        app.listen(PORT, () => {
            console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("❌ Error conectando a PostgreSQL");
        console.error(error);

        process.exit(1);
    }
}

startServer();