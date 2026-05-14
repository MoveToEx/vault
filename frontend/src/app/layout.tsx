import { Outlet } from "react-router";
import { SidebarProvider } from "@/shared/components/ui/sidebar";
import AppSidebar from "@/app/sidebar";
import AppTopBar from "@/app/topbar";
import RegisterDialog from "@/features/auth/components/register-dialog";
import LoginDialog from "@/features/auth/components/login-dialog";
import { Toaster } from "@/shared/components/ui/sonner";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { store } from "@/shared/stores";
import { Provider as StoreProvider } from "react-redux";
import { Drawer } from "@base-ui/react";

export default function Layout() {
  return (
    <StoreProvider store={store}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <Drawer.Provider>
          <SidebarProvider>
            <div className="h-screen w-screen flex flex-row">
              <Toaster position="top-center" />
              <LoginDialog />
              <RegisterDialog />
              <AppSidebar />
              <div className="w-full h-screen flex flex-col">
                <AppTopBar />
                <ScrollArea className="flex-1 w-full h-full overflow-auto">
                  <div className="w-full h-full px-2 lg:px-16 md:px-8 py-4 md:py-6 lg:py-8">
                    <Outlet />
                  </div>
                </ScrollArea>
              </div>
            </div>
          </SidebarProvider>
        </Drawer.Provider>
      </ThemeProvider>
    </StoreProvider>
  );
}
