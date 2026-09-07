import { useEffect, useState } from "react";
import { getDashboard } from "../services/dashboardService";
import AppShell from "../components/layout/AppShell";
import StatCard from "../components/dashboard/StatCard";
import Skeleton from "../components/ui/Skeleton";
import Servers from "./Servers";
import Alerts from "../components/dashboard/Alerts";

function Dashboard() {

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {

  async function cargarDashboard() {

    try {

      const token = localStorage.getItem("token");

      const datos = await getDashboard(token);

      setDashboard(datos.dashboard);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  cargarDashboard();

  const intervalo = setInterval(cargarDashboard, 20000);

  return () => clearInterval(intervalo);

}, []);

  return (
    <AppShell>
      <section className="section">
        <p className="section__eyebrow">Resumen</p>
        <h2 className="section__title">Bienvenido a ServerHub</h2>
      </section>

      {loading && (
        <section className="section">
          <div className="stat-grid">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="stat-card stat-card--skeleton">
                <Skeleton style={{ width: "60%", height: "11px" }} />
                <Skeleton style={{ width: "40%", height: "24px" }} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && dashboard && (
        <section className="section">
          <div className="stat-grid">
            <StatCard label="Servidores" value={dashboard.totalServers} />
            <StatCard label="En línea" value={dashboard.onlineServers} />
            <StatCard label="Sin conexión" value={dashboard.offlineServers} />
            <StatCard label="Agentes" value={dashboard.totalAgents} />
            <StatCard
              label="CPU promedio"
              value={dashboard.avgCpu}
              unit="%"
              progress={dashboard.avgCpu}
            />
            <StatCard
              label="RAM promedio"
              value={dashboard.avgRam}
              unit="%"
              progress={dashboard.avgRam}
            />
            <StatCard
              label="Disco promedio"
              value={dashboard.avgDisk}
              unit="%"
              progress={dashboard.avgDisk}
            />
          </div>
        </section>
      )}

      <Alerts />

      <section className="section">
        <Servers />
      </section>
    </AppShell>
  );
}

export default Dashboard;