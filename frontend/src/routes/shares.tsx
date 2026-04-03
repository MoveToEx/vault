import RequireUMK from "@/components/require-umk";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import useAuth from "@/hooks/use-auth";
import useMyShares from "@/hooks/use-my-shares";
import useShares from "@/hooks/use-shares"
import { aeadDecrypt, kdf } from "@/lib/crypto";
import { transferBridge } from "@/lib/transfer-bridge";
import type { FileMetadata } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/stores";
import { toggleTransferList } from "@/stores/ui";
import sodium, { from_base64, to_string } from "libsodium-wrappers-sumo";
import { Download, Share2 } from "lucide-react";
import { useMemo, useState } from "react";

type ShareMetadata = FileMetadata & {
  createdAt: Date,
  expiresAt: Date,
  id: number,
}

function SharedWithMe() {
  const [page] = useState(1);
  // [ ] add pagination

  const { data } = useShares(page);
  const { data: user } = useAuth();

  const umk = useAppSelector(state => state.umk.value);
  const dispatch = useAppDispatch();

  const pkey = useMemo(() => {
    if (!umk || !user) return null;

    const kek = kdf(from_base64(umk), 'KEK');

    const result = aeadDecrypt(from_base64(user.encryptedPrivateKey), kek, from_base64(user.privateKeyNonce));

    return result;
  }, [umk, user]);

  const decrypted = useMemo(() => {
    if (!data || !user || !pkey) return [];

    const result: ShareMetadata[] = [];

    for (const it of data) {
      const metadata: FileMetadata = JSON.parse(
        to_string(
          sodium.crypto_box_seal_open(
            from_base64(it.encryptedMetadata),
            from_base64(user.publicKey),
            pkey,
          )
        )
      );

      result.push({
        ...metadata,
        createdAt: new Date(it.createdAt),
        expiresAt: new Date(it.expiresAt),
        id: it.id,
      });
    }

    return result;

  }, [data, user, pkey]);

  if (!user || !umk) {
    return <></>
  }

  if (data?.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Share2 />
          </EmptyMedia>
          <EmptyTitle>
            No files shared with you
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            File name
          </TableHead>
          <TableHead>
            Shared at
          </TableHead>
          <TableHead>
            Action
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>

        {decrypted && decrypted?.length > 0 && decrypted.map(it => (
          <TableRow key={it.id} className='group'>
            <TableCell>
              {it.name}
            </TableCell>
            <TableCell>
              {it.createdAt.toLocaleDateString()}
            </TableCell>
            <TableCell>
              <Button
                className='duration-[0] invisible group-hover:visible'
                variant='outline'
                size='icon-sm'
                onClick={() => {
                  transferBridge.enqueueDownloadShare(
                    it.id,
                    from_base64(umk),
                    from_base64(user.publicKey),
                    from_base64(user.encryptedPrivateKey),
                    from_base64(user.privateKeyNonce),
                  );
                  dispatch(toggleTransferList(true));
                }}>
                <Download />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SharedByMe() {
  const [page] = useState(1);

  const { data } = useMyShares(page);
  const { data: user } = useAuth();

  const umk = useAppSelector(state => state.umk.value);

  const decrypted = useMemo(() => {
    if (!data || !user || !umk) return [];

    const result: ShareMetadata[] = [];

    const kek = kdf(from_base64(umk), 'KEK');

    for (const it of data) {
      const metadata: FileMetadata = JSON.parse(
        to_string(
          aeadDecrypt(
            from_base64(it.encryptedMetadata),
            kek,
            from_base64(it.metadataNonce),
          )
        )
      );

      result.push({
        ...metadata,
        createdAt: new Date(it.createdAt),
        expiresAt: new Date(it.expiresAt),
        id: it.id,
      });
    }

    return result;

  }, [data, user, umk]);

  if (!user || !umk) {
    return <></>
  }

  if (data?.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Share2 />
          </EmptyMedia>
          <EmptyTitle>
            No files shared by you
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            File name
          </TableHead>
          <TableHead>
            Shared at
          </TableHead>
          <TableHead>
            Action
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>

        {decrypted && decrypted?.length > 0 && decrypted.map(it => (
          <TableRow key={it.id} className='group'>
            <TableCell>
              {it.name}
            </TableCell>
            <TableCell>
              {it.createdAt.toLocaleDateString()}
            </TableCell>
            <TableCell>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}


export default function SharesPage() {

  return (
    <div>
      <RequireUMK />
      <p>
        Shared with you
      </p>
      <SharedWithMe />

      <p>
        Shared by you
      </p>
      <SharedByMe />
    </div>
  )
}