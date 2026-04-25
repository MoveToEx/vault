import {
  ChevronUp,
  ExternalLink,
  FolderOpen,
  Home,
  Lock,
  LogIn,
  LogOut,
  Logs,
  Settings,
  Share2,
  Shield,
  User2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useAuth from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { Link, useLocation, useNavigate } from "react-router";
import { useAppDispatch } from "@/stores";
import { reset as resetKeys } from "@/stores/key";
import { toggleLoginDialog } from "@/stores/ui";
import { formatSize, logout } from "@/lib/utils";
import type { FC } from "react";
import { Progress } from "@base-ui/react";
import useCapacity from "@/hooks/use-capacity";
import { PERMISSION_ADMIN } from "@/components/require-admin";
import { useTranslation } from "react-i18next";

const navDefs = [
  {
    titleKey: "nav.home" as const,
    url: "/",
    icon: Home,
  },
];

const userNavDefs = [
  {
    titleKey: "nav.drive" as const,
    url: "/drive",
    icon: FolderOpen,
  },
  {
    titleKey: "nav.audit" as const,
    url: "/audit",
    icon: Logs,
  },
  {
    titleKey: "nav.share" as const,
    url: "/share",
    icon: Share2,
  },
]

const adminNavDef = {
  titleKey: "nav.admin" as const,
  url: "/admin",
  icon: Shield,
};

function Capacity() {
  const { data } = useCapacity();

  if (!data) return <></>

  return (
    <Progress.Root className='' value={data ? data.used / data.capacity * 100 : 0}>
      <Progress.Label className='text-xs'>
        {formatSize(data.used)} / {formatSize(data.capacity)}
      </Progress.Label>
      <Progress.Track className='h-0.5 bg-background'>
        <Progress.Indicator className='h-0.5 bg-foreground' />
      </Progress.Track>
    </Progress.Root>
  )
}

function AccountMenu() {
  const { data, error, isLoading, reset, mutate } = useAuth();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const navigate = useNavigate();

  if (isLoading) {
    return (
      <SidebarMenuButton className="h-10" disabled>
        <Spinner /> {t("common.loading")}
      </SidebarMenuButton>
    );
  }

  if (error || !data) {
    return (
      <SidebarMenuButton
        className="h-10"
        onClick={() => dispatch(toggleLoginDialog(true))}
      >
        <LogIn /> {t("common.login")}
      </SidebarMenuButton>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton className="h-12 flex flex-row">
              <User2 />
              <div className='flex flex-1 flex-col flex-nowrap overflow-hidden'>
                <div className='flex flex-1 flex-row items-center justify-between'>
                  <span>
                    {data.username}
                  </span>
                </div>
                <Capacity />
              </div>
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          }
        />
        <DropdownMenuContent
          side="top"
          className="w-[--radix-popper-anchor-width]"
        >
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              navigate("/user/settings");
            }}
          >
            <Settings /> {t("common.settings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              dispatch(resetKeys());
            }}
          >
            <Lock /> {t("common.lock")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              reset();
              logout();
              mutate();
            }}
          >
            <LogOut />
            {t("common.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function SidebarItem({
  url,
  title,
  Icon,
}: {
  url: string;
  title: string;
  Icon: FC;
}) {
  useLocation();

  const target = new URL(
    url,
    `${window.location.protocol}//${window.location.host}`,
  );
  const sameOrigin = window.location.host === target.host;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={
          sameOrigin && window.location.pathname === target.pathname ? "bg-accent" : ""
        }
        render={
          <Link to={url} target={sameOrigin ? "_self" : "_blank"}>
            <Icon />
            <span>{title}</span>
            {!sameOrigin && (
              <ExternalLink className="text-muted-foreground max-w-3 max-h-3" />
            )}
          </Link>
        }
      />
    </SidebarMenuItem>
  );
}

export default function AppSidebar() {
  const { data: authUser } = useAuth();
  const { t } = useTranslation();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup className="overflow-x-hidden">
          <SidebarGroupContent>
            {navDefs.map(({ url, icon, titleKey }) => (
              <SidebarItem
                url={url}
                title={t(titleKey)}
                Icon={icon}
                key={titleKey}
              />
            ))}
            {authUser && (
              userNavDefs.map(({ url, icon, titleKey }) => (
                <SidebarItem
                  url={url}
                  title={t(titleKey)}
                  Icon={icon}
                  key={titleKey}
                />
              ))
            )}
            {authUser && authUser.permission === PERMISSION_ADMIN && (
              <SidebarItem
                url={adminNavDef.url}
                title={t(adminNavDef.titleKey)}
                Icon={adminNavDef.icon}
              />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
