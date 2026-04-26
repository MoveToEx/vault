import RequireUMK from "@/components/require-umk";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useAuth from "@/hooks/use-auth";
import useMyShares from "@/hooks/use-my-shares";
import useShares from "@/hooks/use-shares";
import { open } from "@/lib/crypto";
import { transferBridge } from "@/lib/transfer-bridge";
import type { FileMetadata } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/stores";
import { toggleTransferList } from "@/stores/ui";
import { from_base64, to_string } from "libsodium-wrappers-sumo";
import { Ban, Download, Share2 } from "lucide-react";
import {
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Dialog as BaseDialog } from "@base-ui/react";
import RevokeShareDialog from "@/components/dialogs/revoke-share";
import { useTranslation } from "react-i18next";
import usePublicShares from "@/hooks/use-public-shares";
import RevokePublicShareDialog from "@/components/dialogs/revoke-public-share";

type ShareMetadata = FileMetadata & {
  createdAt: Date;
  expiresAt: Date;
  id: number;
  sender: string;
};

type MyShareMetadata = FileMetadata & {
  createdAt: Date;
  expiresAt: Date;
  id: number;
  receiver: string;
};

type PublicShareMetadata = FileMetadata & {
  createdAt: Date;
  expiresAt: Date;
  key: string;
};

const SHARES_LIST_PAGE_SIZE = 24;

function ListPagination(props: {
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  hasMore: boolean;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const { page, setPage, hasMore, isLoading } = props;
  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <p className="text-sm text-muted-foreground">
        {t("common.pagedListPage", { page })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || isLoading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          {t("common.previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasMore || isLoading}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

function SharedWithMe() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useShares(page);
  const { data: user } = useAuth();

  const keys = useAppSelector(state => state.key.value);
  const dispatch = useAppDispatch();

  const decrypted = useMemo(() => {
    if (!data || !user || !keys) return [];

    const result: ShareMetadata[] = [];

    for (const it of data) {
      const metadata: FileMetadata = JSON.parse(
        to_string(
          open(
            from_base64(it.encryptedMetadata),
            from_base64(keys.pubKey),
            from_base64(keys.privKey),
          ),
        ),
      );

      result.push({
        ...metadata,
        createdAt: new Date(it.createdAt),
        expiresAt: new Date(it.expiresAt),
        id: it.id,
        sender: it.sender,
      });
    }

    return result;
  }, [data, user, keys]);

  if (!user || !keys) {
    return <></>;
  }

  if (data && data.length === 0 && page === 1) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Share2 />
          </EmptyMedia>
          <EmptyTitle>{t("common.noFilesSharedWithYou")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <div className='w-full flex flex-row items-center'>
        <span>
          <p>{t("common.sharedByYou")}</p>
        </span>
        <div className='flex-1' />
        <ListPagination
          page={page}
          setPage={setPage}
          hasMore={data !== undefined && data.length === SHARES_LIST_PAGE_SIZE}
          isLoading={isLoading}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.fileName")}</TableHead>
            <TableHead>{t("common.sharedAt")}</TableHead>
            <TableHead>{t("common.sharedBy")}</TableHead>
            <TableHead>{t("common.action")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {decrypted &&
            decrypted?.length > 0 &&
            decrypted.map((it) => (
              <TableRow key={it.id} className="group">
                <TableCell>{it.name}</TableCell>
                <TableCell>{it.createdAt.toLocaleDateString()}</TableCell>
                <TableCell>{it.sender}</TableCell>
                <TableCell>
                  <Button
                    className="duration-[0] invisible group-hover:visible"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => {
                      transferBridge.enqueueDownloadShare(
                        it.id,
                        from_base64(keys.pubKey),
                        from_base64(keys.privKey),
                      );
                      dispatch(toggleTransferList(true));
                    }}
                  >
                    <Download />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

const revokeHandle = BaseDialog.createHandle<{
  id: number;
  filename: string;
}>();

function SharedByMe() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useMyShares(page);
  const { data: user } = useAuth();

  const keys = useAppSelector((state) => state.key.value);

  const decrypted = useMemo(() => {
    if (!data || !user || !keys) return [];

    const result: MyShareMetadata[] = [];

    for (const it of data) {
      const metadata: FileMetadata = JSON.parse(
        to_string(
          open(
            from_base64(it.encryptedMetadata),
            from_base64(keys.pubKey),
            from_base64(keys.privKey),
          ),
        ),
      );

      result.push({
        ...metadata,
        createdAt: new Date(it.createdAt),
        expiresAt: new Date(it.expiresAt),
        id: it.id,
        receiver: it.receiver,
      });
    }

    return result;
  }, [data, user, keys]);

  if (!user || !keys) {
    return <></>;
  }

  if (data && data.length === 0 && page === 1) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Share2 />
          </EmptyMedia>
          <EmptyTitle>{t("common.noFilesSharedByYou")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <RevokeShareDialog handle={revokeHandle} />
      <div className='w-full flex flex-row items-center'>
        <span>
          <p>{t("common.sharedWithYou")}</p>
        </span>
        <div className='flex-1' />
        <ListPagination
          page={page}
          setPage={setPage}
          hasMore={data !== undefined && data.length === SHARES_LIST_PAGE_SIZE}
          isLoading={isLoading}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.fileName")}</TableHead>
            <TableHead>{t("common.sharedAt")}</TableHead>
            <TableHead>{t("common.expiresAt")}</TableHead>
            <TableHead>{t("common.sharedWith")}</TableHead>
            <TableHead>{t("common.action")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {decrypted &&
            decrypted?.length > 0 &&
            decrypted.map((it) => (
              <TableRow key={it.id} className="group">
                <TableCell>{it.name}</TableCell>
                <TableCell>{it.createdAt.toLocaleString()}</TableCell>
                <TableCell>{it.expiresAt.toLocaleString()}</TableCell>
                <TableCell>{it.receiver}</TableCell>
                <TableCell className="flex flex-row items-center justify-start gap-2">
                  {it.type === "file" && (
                    <Button
                      className="duration-[0] invisible group-hover:visible text-destructive"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => {
                        revokeHandle.openWithPayload({
                          id: it.id,
                          filename: it.name,
                        });
                      }}
                    >
                      <Ban />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

const revokePublicHandle = BaseDialog.createHandle<{
  key: string;
  filename: string;
}>();

function PublicShares() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePublicShares(page);
  const { data: user } = useAuth();

  const keys = useAppSelector((state) => state.key.value);

  const decrypted = useMemo(() => {
    if (!data || !user || !keys) return [];

    const result: PublicShareMetadata[] = [];

    for (const it of data) {
      const metadata: FileMetadata = JSON.parse(
        to_string(
          open(
            from_base64(it.encryptedMetadata),
            from_base64(keys.pubKey),
            from_base64(keys.privKey),
          ),
        ),
      );

      result.push({
        ...metadata,
        createdAt: new Date(it.createdAt),
        expiresAt: new Date(it.expiresAt),
        key: it.key,
      });
    }

    return result;
  }, [data, user, keys]);

  if (!user || !keys) {
    return <></>;
  }

  if (data && data.length === 0 && page === 1) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Share2 />
          </EmptyMedia>
          <EmptyTitle>{t("common.noPublicSharesByYou")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <RevokePublicShareDialog handle={revokePublicHandle} />
      <div className='w-full flex flex-row items-center'>
        <span>
          <p>{t("common.publicSharesByYou")}</p>
        </span>
        <div className='flex-1' />
        <ListPagination
          page={page}
          setPage={setPage}
          hasMore={data !== undefined && data.length === SHARES_LIST_PAGE_SIZE}
          isLoading={isLoading}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.fileName")}</TableHead>
            <TableHead>{t("common.sharedAt")}</TableHead>
            <TableHead>{t("common.expiresAt")}</TableHead>
            <TableHead>{t("common.shareKeyColumn")}</TableHead>
            <TableHead>{t("common.action")}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {decrypted &&
            decrypted?.length > 0 &&
            decrypted.map((it) => (
              <TableRow key={it.key} className="group">
                <TableCell>{it.name}</TableCell>
                <TableCell>{it.createdAt.toLocaleString()}</TableCell>
                <TableCell>{it.expiresAt.toLocaleString()}</TableCell>
                <TableCell>{it.key}</TableCell>
                <TableCell className="flex flex-row items-center justify-start gap-2">
                  {it.type === "file" && (
                    <Button
                      className="duration-[0] invisible group-hover:visible text-destructive"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => {
                        revokePublicHandle.openWithPayload({
                          key: it.key,
                          filename: it.name,
                        });
                      }}
                    >
                      <Ban />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function SharesPage() {
  return (
    <div>
      <RequireUMK />
      <SharedWithMe />
      <Separator className="my-4" />
      <SharedByMe />
      <Separator className="my-4" />
      <PublicShares />
    </div>
  );
}
