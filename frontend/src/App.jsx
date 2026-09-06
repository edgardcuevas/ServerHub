import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ServerDetail from "./pages/ServerDetail";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/routing/ProtectedRoute";
import GuestRoute from "./components/routing/GuestRoute";
import { ToastProvider } from "./components/ui/Toast";
import ServerAdmin from "./pages/ServerAdmin";

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />

          <Route
            path="/register"
            element={
              <GuestRoute>
                <Register />
              </GuestRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/servers/:id"
            element={
              <ProtectedRoute>
                <ServerDetail />
              </ProtectedRoute>
            }
          />

          <Route
  path="/servers/:id/admin"
  element={
    <ProtectedRoute>
      <ServerAdmin />
    </ProtectedRoute>
  }
/>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;