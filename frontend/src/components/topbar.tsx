import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import TransferList from "./transfer-list";

export default function AppTopBar() {
  return (
    <div className="w-full border-b border-gray-250 h-12 flex flex-row items-center px-4 gap-2">
      <SidebarTrigger />
      <a className="text-lg flex items-center ml-2" href="/#/">
        Vault
      </a>
      <div className="flex-1" />
      <ModeToggle />
      <TransferList />
    </div>
  );
}
