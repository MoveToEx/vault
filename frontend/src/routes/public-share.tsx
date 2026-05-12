import ExtIcon from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import usePublicShare from "@/hooks/use-public-share";
import { formatSize } from "@/lib/utils";
import { Download } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useParams } from "react-router"
import { transferBridge } from '@/lib/transfer-bridge';
import { useAppDispatch } from "@/stores";
import { toggleTransferList } from "@/stores/ui";
import { PublicShare } from "@/lib/crypto_wrappers";

export default function PublicSharePage() {
  const params = useParams();
  const dispatch = useAppDispatch();

  const { data, isLoading } = usePublicShare(params.key ?? '');
  const location = useLocation();

  const metadata = useMemo(() => {
    if (!data) return null;

    const k = location.hash.slice(1);

    if (!k) return null;

    try {
      return PublicShare.decrypt(
        data.envelope,
        data.kemCipher,
        data.sgnPub,
        k
      );
    }
    catch {
      return null;
    }
  }, [data, location]);

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
        Invalid or incomplete link
      </div>
    )
  }

  return (
    <div className='flex flex-col items-center'>
      <div className='w-lg px-4 flex flex-col'>
        <div className='mb-8'>
          {`${data.owner} shared a file`}
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
              const k = location.hash.slice(1), sid = params.key;

              if (!k || !sid) return null;

              transferBridge.enqueueDownloadPublicShare(sid, k, data.sgnPub);
              dispatch(toggleTransferList(true));
            }}>
              <Download />
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}