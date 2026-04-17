import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import { useAppContext } from "./context/AppContext";
import Admin from "./pages/Admin";
import Forum from "./pages/Forum";
import ForumThread from "./pages/ForumThread";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Lootbox from "./pages/Lootbox";
import Market from "./pages/Market";
import Profile from "./pages/Profile";

const RequireAuth = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
};

const RequireAdmin = ({ isAdmin }: { isAdmin: boolean }) => {
  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }
  return <Outlet />;
};

const App = () => {
  const { authReady, isAuthenticated, user } = useAppContext();
  const isAdmin = user?.role === "admin";

  if (!authReady) {
    return <div className="page-shell"><p className="muted">Restoring session...</p></div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/home" replace /> : <Login />}
      />

      <Route element={<RequireAuth isAuthenticated={isAuthenticated} />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/forum/:postId" element={<ForumThread />} />
          <Route path="/lootbox" element={<Lootbox />} />
          <Route path="/market" element={<Market />} />
          <Route path="/profile" element={<Profile />} />

          {/* Admin-only routes */}
          <Route element={<RequireAdmin isAdmin={isAdmin} />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/home" : "/login"} replace />}
      />
    </Routes>
  );
};

export default App;
