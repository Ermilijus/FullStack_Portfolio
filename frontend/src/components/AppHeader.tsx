import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

const BASE_NAV_ITEMS = [
  { to: "/home", label: "Home" },
  { to: "/lootbox", label: "Lootbox" },
  { to: "/market", label: "Market" },
  { to: "/trade", label: "Trade" },
  { to: "/forum", label: "Forum" },
  { to: "/profile", label: "Profile" },
];

const ADMIN_NAV_ITEM = { to: "/admin", label: "Admin" };

type ThemePreset = "dark" | "light" | "neon" | "custom";

const THEME_STORAGE_KEY = "themePreset";

const isThemePreset = (value: string): value is ThemePreset => {
  return value === "dark" || value === "light" || value === "neon" || value === "custom";
};

const AppHeader = () => {
  const { user, logout } = useAppContext();
  const navItems = user?.role === "admin"
    ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM]
    : BASE_NAV_ITEMS;
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemePreset>("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && isThemePreset(savedTheme)) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
      return;
    }

    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  const handleThemeChange = (value: ThemePreset) => {
    setTheme(value);
    localStorage.setItem(THEME_STORAGE_KEY, value);
    document.documentElement.setAttribute("data-theme", value);
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="app-header">
      <div className="brand">
        <span>The Hub</span>
      </div>
      <nav className="app-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="user-chip">
        <label className="theme-picker" htmlFor="theme-picker-select">
          <span className="theme-picker-label">Theme</span>
          <select
            id="theme-picker-select"
            className="theme-picker-select"
            value={theme}
            onChange={(event) => handleThemeChange(event.target.value as ThemePreset)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="neon">Neon</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <span>{user?.username ?? user?.email ?? "User"}</span>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
