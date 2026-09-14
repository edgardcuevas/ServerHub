import { useEffect, useState } from "react";
import { getDashboard } from "../services/dashboardService";
import AppShell from "../components/layout/AppShell";
import { levelClass } from "../components/dashboard/StatCard";
import FleetRing from "../components/dashboard/FleetRing";
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
        <div className="dashboard-panel fleet-hero">
          <Skeleton style={{ width: "132px", height: "132px", borderRadius: "50%" }} />
          <div className="fleet-hero__metrics">
            <Skeleton style={{ width: "100%", height: "14px", marginBottom: "18px" }} />
            <Skeleton style={{ width: "100%", height: "14px", marginBottom: "18px" }} />
            <Skeleton style={{ width: "100%", height: "14px" }} />
          </div>
        </div>
      )}

      {!loading && dashboard && (
        <div className="dashboard-panel fleet-hero">
          <FleetRing online={dashboard.onlineServers} total={dashboard.totalServers} />

          <div className="fleet-hero__metrics">
            <div className="fleet-hero__bar">
              <div className="fleet-hero__bar-head">
                <span>CPU promedio</span>
                <span>{dashboard.avgCpu}%</span>
              </div>
              <div className="stat-card__bar">
                <div
                  className={`stat-card__bar-fill ${levelClass(dashboard.avgCpu)}`.trim()}
                  style={{ width: `${Math.min(100, Math.max(0, dashboard.avgCpu))}%` }}
                />
              </div>
            </div>

            <div className="fleet-hero__bar">
              <div className="fleet-hero__bar-head">
                <span>RAM promedio</span>
                <span>{dashboard.avgRam}%</span>
              </div>
              <div className="stat-card__bar">
                <div
                  className={`stat-card__bar-fill ${levelClass(dashboard.avgRam)}`.trim()}
                  style={{ width: `${Math.min(100, Math.max(0, dashboard.avgRam))}%` }}
                />
              </div>
            </div>

            <div className="fleet-hero__bar">
              <div className="fleet-hero__bar-head">
                <span>Disco promedio</span>
                <span>{dashboard.avgDisk}%</span>
              </div>
              <div className="stat-card__bar">
                <div
                  className={`stat-card__bar-fill ${levelClass(dashboard.avgDisk)}`.trim()}
                  style={{ width: `${Math.min(100, Math.max(0, dashboard.avgDisk))}%` }}
                />
              </div>
            </div>

            <p className="fleet-hero__meta">
              {dashboard.totalServers} servidores · {dashboard.totalAgents} agentes vinculados
            </p>
          </div>
        </div>
      )}

      <div className="dashboard-panel">
        <Alerts />
      </div>

      <div className="dashboard-panel">
        <section className="section">
          <Servers />
        </section>
      </div>
    </AppShell>
  );
}

export default Dashboard;