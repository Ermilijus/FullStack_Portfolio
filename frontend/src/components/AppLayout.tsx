import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";

const AppLayout = () => {
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
      <main className="page-shell">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
