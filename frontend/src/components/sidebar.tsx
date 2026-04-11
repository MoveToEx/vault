import {
  ChevronUp,
  ExternalLink,
  Home,
  Lock,
  LogIn,
  LogOut,
  Logs,
  Settings,
  Share2,
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
import { Dialog as BaseDialog } from "@base-ui/react";
import LoginDialog from "./dialogs/login";
import { useLocation, useNavigate } from "react-router";
import { useAppDispatch } from "@/stores";
import { reset as resetKeys } from "@/stores/key";
import { formatSize, logout } from "@/lib/utils";
import type { FC } from "react";
import { Progress } from "@base-ui/react";
import useCapacity from "@/hooks/use-capacity";

const loginHandle = BaseDialog.createHandle<void>();

const items = [
  {
    title: "Home",
    url: "/#/",
    icon: Home,
  },
  {
    title: "Audit",
    url: "/#/audit",
    icon: Logs,
  },
  {
    title: "Share",
    url: "/#/share",
    icon: Share2,
  },
];

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

  const navigate = useNavigate();

  if (isLoading) {
    return (
      <>
        <LoginDialog handle={loginHandle} />
        <BaseDialog.Trigger
          handle={loginHandle}
          disabled
          render={
            <SidebarMenuButton className="h-10">
              <Spinner /> Loading
            </SidebarMenuButton>
          }
        />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <LoginDialog handle={loginHandle} />
        <BaseDialog.Trigger
          handle={loginHandle}
          render={
            <SidebarMenuButton className="h-10">
              <LogIn /> Login
            </SidebarMenuButton>
          }
        />
      </>
    );
  }

  return (
    <>
      <LoginDialog handle={loginHandle} />
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
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              dispatch(resetKeys());
            }}
          >
            <Lock /> Lock
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              reset();
              logout();
              mutate();
            }}
          >
            <LogOut />
            Logout
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
          sameOrigin && window.location.hash === target.hash ? "bg-accent" : ""
        }
        render={
          <a href={url} target={sameOrigin ? "_self" : "_blank"}>
            <Icon />
            <span>{title}</span>
            {!sameOrigin && (
              <ExternalLink className="text-muted-foreground max-w-3 max-h-3" />
            )}
          </a>
        }
      />
    </SidebarMenuItem>
  );
}

export default function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup className="overflow-x-hidden">
          <SidebarGroupContent>
            {items.map(({ url, icon, title }) => (
              <SidebarItem url={url} title={title} Icon={icon} key={title} />
            ))}
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
