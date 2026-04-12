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
import type { Metadata } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/stores";
import { toggleTransferList } from "@/stores/ui";
import { from_base64, to_string } from "libsodium-wrappers-sumo";
import { Ban, Download, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react";
import RevokeShareDialog from "@/components/dialogs/revoke-share";

type FileMetadata = Extract<Metadata, { type: 'file' }>;

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

function SharedWithMe() {
  const [page] = useState(1);
  // [ ] add pagination

  const { data } = useShares(page);
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

  if (data?.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Share2 />
          </EmptyMedia>
          <EmptyTitle>No files shared with you</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File name</TableHead>
          <TableHead>Shared at</TableHead>
          <TableHead>Shared by</TableHead>
          <TableHead>Action</TableHead>
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
  );
}

const revokeHandle = BaseDialog.createHandle<{
  id: number;
  filename: string;
}>();

function SharedByMe() {
  const [page] = useState(1);

  const { data } = useMyShares(page);
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

  if (data?.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Share2 />
          </EmptyMedia>
          <EmptyTitle>No files shared by you</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <RevokeShareDialog handle={revokeHandle} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File name</TableHead>
            <TableHead>Shared at</TableHead>
            <TableHead>Expires at</TableHead>
            <TableHead>Shared with</TableHead>
            <TableHead>Action</TableHead>
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

export default function SharesPage() {
  return (
    <div>
      <RequireUMK />
      <p>Shared with you</p>
      <SharedWithMe />

      <Separator className="my-4 " />

      <p>Shared by you</p>
      <SharedByMe />
    </div>
  );
}
