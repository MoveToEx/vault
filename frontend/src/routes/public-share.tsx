import ExtIcon from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import usePublicShare from "@/hooks/use-public-share";
import { open } from "@/lib/crypto";
import type { FileMetadata } from "@/lib/types";
import { formatSize } from "@/lib/utils";
import { from_base64, to_string } from "libsodium-wrappers-sumo";
import { Download } from "lucide-react";
import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router"
import { transferBridge } from '@/lib/transfer-bridge';
import { useAppDispatch } from "@/stores";
import { toggleTransferList } from "@/stores/ui";
import { useTranslation } from "react-i18next";

export default function PublicSharePage() {
  const { t } = useTranslation();
  const params = useParams();
  const dispatch = useAppDispatch();

  const { data, isLoading } = usePublicShare(params.key ?? '');

  const [searchParams] = useSearchParams();

  const metadata = useMemo(() => {
    if (!data) return null;

    const sk = searchParams.get('sk'), pk = searchParams.get('pk');

    if (!sk || !pk) return null;

    let plaintext: Uint8Array;

    try {
      const privateKey = from_base64(sk), publicKey = from_base64(pk);
      plaintext = open(from_base64(data.encryptedMetadata), publicKey, privateKey);
    }
    catch {
      return null;
    }

    return JSON.parse(to_string(plaintext)) as FileMetadata;
  }, [data, searchParams]);

  if (isLoading) {
    return (
      <div>
        <Spinner />
      </div>
    )
  }

  if (!metadata || !data) {
    return (
      <div>
        {t("common.invalidShareLink")}
      </div>
    )
  }

  return (
    <div className='flex flex-col items-center'>
      <div className='w-lg px-4 flex flex-col'>
        <div className='mb-8'>
          {t("common.ownerSharedAFile", { owner: data.owner })}
        </div>
        <div className='flex flex-col h-72 border'>
          <div className='flex-1 flex flex-col justify-center items-center gap-2'>
            <div>
              <ExtIcon className='my-4' filename={metadata.name} size={48} />
            </div>
            <div>
              {metadata.name}
            </div>
            <div>
              <span className='text-secondary-foreground text-sm'>{formatSize(data.size)}</span>
            </div>
          </div>
          <Separator className='m-0' />
          <div className='my-4 flex flex-col items-center'>
            <Button className='w-48' variant='outline' onClick={() => {
              const sk = searchParams.get('sk'), pk = searchParams.get('pk'), key = params.key;

              if (!sk || !pk || !key) return null;

              transferBridge.enqueueDownloadPublicShare(
                key,
                from_base64(pk),
                from_base64(sk)
              );
              dispatch(toggleTransferList(true));
            }}>
              <Download />
              {t("common.download")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}