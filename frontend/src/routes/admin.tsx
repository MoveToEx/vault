import RequireAdmin from "@/components/require-admin";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Settings, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

const links = [
  {
    to: "/admin",
    labelKey: "common.dashboard" as const,
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/admin/config",
    labelKey: "common.siteConfiguration" as const,
    icon: Settings,
  },
  { to: "/admin/users", labelKey: "common.usersNav" as const, icon: Users },
];

export default function AdminSection() {
  const { t } = useTranslation();

  return (
    <RequireAdmin>
      <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
        <nav className="flex flex-wrap gap-2 border-b pb-3">
          {links.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </RequireAdmin>
  );
}
