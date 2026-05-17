import { SidebarTrigger } from "@/shared/components/ui/sidebar";
import { ModeToggle } from "@/app/mode-toggle";
import TransferList from "@/features/transfer/components/transfer-list";
import { Link } from "react-router";

export default function AppTopBar() {

  return (
    <div className="w-full border-b border-gray-250 h-12 flex flex-row items-center px-4 gap-2">
      <SidebarTrigger />
      <Link className="text-lg flex items-center ml-2 tracking-tight" to="/drive">
        Vault
      </Link>
      <div className="flex-1" />
      <ModeToggle />
      <TransferList />
    </div>
  );
}
