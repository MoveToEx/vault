import RequireAdmin from "@/components/require-admin";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Settings, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router";

const links = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/config", label: "Site configuration", icon: Settings },
  { to: "/admin/users", label: "Users", icon: Users },
];

export default function AdminSection() {
  return (
    <RequireAdmin>
      <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Site-wide statistics, configuration, and user accounts.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 border-b pb-3">
          {links.map(({ to, label, icon: Icon, end }) => (
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
              {label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </RequireAdmin>
  );
}
