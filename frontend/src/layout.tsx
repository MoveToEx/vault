import { Outlet } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/sidebar";
import AppTopBar from "@/components/topbar";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ScrollArea } from "./components/ui/scroll-area";
import { store } from '@/stores';
import { Provider as StoreProvider } from 'react-redux';
import { Drawer } from "@base-ui/react";

export default function Layout() {
  return (
    <StoreProvider store={store}>
      <ThemeProvider defaultTheme='light' storageKey='vite-ui-theme'>
        <Drawer.Provider>
          <SidebarProvider>
            <div className='h-screen w-screen flex flex-row'>
              <Toaster position='top-center' />
              <AppSidebar />
              <div className='w-full h-screen flex flex-col'>
                <AppTopBar />
                <ScrollArea className='flex-1 w-full overflow-auto'>
                  <div className='w-full px-2 lg:px-16 md:px-8 py-4 md:py-6 lg:py-8'>
                    <Outlet />
                  </div>
                </ScrollArea>
              </div>
            </div>
          </SidebarProvider>
        </Drawer.Provider>
      </ThemeProvider>
    </StoreProvider>
  )
}