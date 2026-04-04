import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { createHashRouter, RouterProvider } from "react-router";
import IndexPage from "./routes/index.tsx";
import Layout from "./layout.tsx";
import AuditPage from "./routes/audit.tsx";
import SharesPage from "./routes/shares.tsx";

const router = createHashRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      {
        index: true,
        Component: IndexPage,
      },
      {
        path: "audit",
        Component: AuditPage,
      },
      {
        path: "share",
        Component: SharesPage,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
