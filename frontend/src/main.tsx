import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./global.css";
import { createBrowserRouter, RouterProvider } from "react-router";
import HomePage from "./routes/index.tsx";
import DrivePage from "./routes/drive.tsx";
import Layout from "./layout.tsx";
import AuditPage from "./routes/audit.tsx";
import SharesPage from "./routes/shares.tsx";
import AdminSection from "./routes/admin.tsx";
import AdminDashboardPage from "./routes/admin-dashboard.tsx";
import AdminSiteConfigPage from "./routes/admin-config.tsx";
import AdminUsersPage from "./routes/admin-users.tsx";
import UserSettingsPage from "./routes/user-settings.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "drive",
        Component: DrivePage,
      },
      {
        path: "audit",
        Component: AuditPage,
      },
      {
        path: "share",
        Component: SharesPage,
      },
      {
        path: "user/settings",
        Component: UserSettingsPage,
      },
      {
        path: "admin",
        Component: AdminSection,
        children: [
          { index: true, Component: AdminDashboardPage },
          { path: "config", Component: AdminSiteConfigPage },
          { path: "users", Component: AdminUsersPage },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
