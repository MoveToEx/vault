import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import TransferList from "./transfer-list";
import { useTranslation } from "react-i18next";

export default function AppTopBar() {
  const { t } = useTranslation();

  return (
    <div className="w-full border-b border-gray-250 h-12 flex flex-row items-center px-4 gap-2">
      <SidebarTrigger />
      <a className="text-lg flex items-center ml-2" href="/#/">
        {t("common.appName")}
      </a>
      <div className="flex-1" />
      <LanguageSwitcher />
      <ModeToggle />
      <TransferList />
    </div>
  );
}
