import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppHeader from "./AppHeader";
import NotificationViewport from "./NotificationViewport";

const AppLayout = () => {
  const location = useLocation();
  const isMarketRoute = location.pathname === "/market";

  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector<HTMLElement>(".app-header");
    if (!header) {
      return;
    }

    const updateHeaderHeight = () => {
      const measuredHeight = Math.ceil(header.getBoundingClientRect().height);
      root.style.setProperty("--app-header-height", `${measuredHeight}px`);
    };

    updateHeaderHeight();

    const observer = new ResizeObserver(() => {
      updateHeaderHeight();
    });

    observer.observe(header);
    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  return (
    <div className="app-shell">
      <AppHeader />
      <NotificationViewport />
      <main className={`page-shell ui-page${isMarketRoute ? " page-shell-market ui-page-market" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
