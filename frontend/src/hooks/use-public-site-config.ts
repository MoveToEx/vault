import api from "@/lib/api";
import useSWR from "swr";

export const publicSiteConfigSWRKey = ["public-site-config"] as const;

export type PublicSiteConfig = {
  registrationOpen: boolean;
};

export default function usePublicSiteConfig(enabled: boolean) {
  return useSWR<PublicSiteConfig>(
    enabled ? publicSiteConfigSWRKey : null,
    () => api.getPublicSiteConfig(),
  );
}