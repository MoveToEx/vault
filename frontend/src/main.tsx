import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { createBrowserRouter, RouterProvider } from "react-router";
import HomePage from "./app/router/home-page.tsx";
import DrivePage from "./features/drive/pages/drive-page.tsx";
import Layout from "./app/layout.tsx";
import AuditPage from "./features/audit/pages/audit-page.tsx";
import SharesPage from "./features/shares/pages/shares-page.tsx";
import AdminSection from "./features/admin/pages/admin-layout.tsx";
import AdminDashboardPage from "./features/admin/pages/dashboard-page.tsx";
import AdminSiteConfigPage from "./features/admin/pages/config-page.tsx";
import AdminUsersPage from "./features/admin/pages/users-page.tsx";
import UserSettingsPage from "./features/user-settings/pages/user-settings-page.tsx";
import PublicSharePage from "./features/shares/pages/public-share-page.tsx";

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
        path: "ps/:key",
        Component: PublicSharePage,
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
