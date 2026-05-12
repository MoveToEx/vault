import RequireUMK from "@/components/require-umk";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import useTrustedSigningKeys from "@/hooks/use-trusted-signing-keys";
import { transferBridge } from "@/lib/transfer-bridge";
import type { FileMetadata } from "@/lib/types";
import { useAppDispatch, useKeys } from "@/stores";
import { toggleTransferList } from "@/stores/ui";
import { Ban, Download, Share2, TriangleAlert } from "lucide-react";
import {
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Dialog as BaseDialog } from "@base-ui/react";
import RevokeShareDialog from "@/components/dialogs/revoke-share";
import usePublicShares from "@/hooks/use-public-shares";
import RevokePublicShareDialog from "@/components/dialogs/revoke-public-share";
import TrustSigningKeyDialog, {
  type TrustSigningKeyPayload,
} from "@/components/dialogs/trust-signing-key";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Envelope } from "@/lib/crypto_wrappers";

type ShareMetadata = FileMetadata & {
  trusted: true;
  createdAt: Date;
  expiresAt: Date;
  id: number;
  sender: string;
  sgnPub: Uint8Array;
};

type UntrustedShareMetadata = {
  trusted: false;
  createdAt: Date;
  expiresAt: Date;
  id: number;
  sender: string;
  sgnPub: Uint8Array;
};

type ShareRowMetadata = ShareMetadata | UntrustedShareMetadata;

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

const trustSigningKeyHandle =
  BaseDialog.createHandle<TrustSigningKeyPayload>();

function ListPagination(props: {
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  hasMore: boolean;
  isLoading: boolean;
}) {
  const { page, setPage, hasMore, isLoading } = props;
  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <p className="text-sm text-muted-foreground">
        {`Page ${page}`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || isLoading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasMore || isLoading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function SharedWithMe() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useShares(page);
  const { data: user } = useAuth();

  const keys = useKeys();
  const trustedSigningKeys = useTrustedSigningKeys(user?.id);
  const { isTrusted, reload: reloadTrustedSigningKeys } = trustedSigningKeys;
  const dispatch = useAppDispatch();

  const decrypted = useMemo(() => {
    if (!data || !user || !keys) return [];

    const result: ShareRowMetadata[] = [];

    for (const it of data) {
      const base = {
        createdAt: new Date(it.createdAt),
        expiresAt: new Date(it.expiresAt),
        id: it.id,
        sender: it.sender,
        sgnPub: it.sgnPub,
      };

      if (!isTrusted(it.sgnPub)) {
        result.push({
          ...base,
          trusted: false,
        });
        continue;
      }

      const metadata = Envelope.decrypt(
        it.envelope,
        it.kemCipher,
        it.sgnPub,
        keys.kem.privateKey
      );

      if (metadata.type !== 'file') continue; // expected never

      result.push({
        ...base,
        ...metadata,
        trusted: true,
      });
    }

    return result;
  }, [data, user, keys, isTrusted]);

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
          <EmptyTitle>No files shared with you</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <TrustSigningKeyDialog
        handle={trustSigningKeyHandle}
        onTrusted={reloadTrustedSigningKeys}
      />
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
                <TableCell>
                  {it.trusted ? (
                    it.name
                  ) : (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <TriangleAlert className="size-4 text-amber-600" />
                      Untrusted signing key
                    </span>
                  )}
                </TableCell>
                <TableCell>{it.createdAt.toLocaleDateString()}</TableCell>
                <TableCell>{it.sender}</TableCell>
                <TableCell>
                  {it.trusted ? (
                    <Button
                      className="duration-[0] invisible group-hover:visible"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => {
                        transferBridge.enqueueDownloadShare(
                          it.id,
                          it.sgnPub,
                          keys.kem,
                        );
                        dispatch(toggleTransferList(true));
                      }}
                    >
                      <Download />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        trustSigningKeyHandle.openWithPayload({
                          userId: user.id,
                          owner: it.sender,
                          publicKey: it.sgnPub,
                        });
                      }}
                    >
                      <TriangleAlert />
                      Trust key
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <div className='w-full flex flex-row justify-end items-center'>
        <ListPagination
          page={page}
          setPage={setPage}
          hasMore={data !== undefined && data.length === SHARES_LIST_PAGE_SIZE}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

const revokeHandle = BaseDialog.createHandle<{
  id: number;
  filename: string;
}>();

function SharedByMe() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useMyShares(page);
  const { data: user } = useAuth();

  const keys = useKeys();

  const decrypted = useMemo(() => {
    if (!data || !user || !keys) return [];

    const result: MyShareMetadata[] = [];

    for (const it of data) {
      const metadata = Envelope.decrypt(it.envelope, it.kemCipher, keys.sign.publicKey, keys.kem.privateKey);

      if (metadata.type !== 'file') continue;   // never

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
      <div className='w-full flex flex-row items-center justify-end'>
        <ListPagination
          page={page}
          setPage={setPage}
          hasMore={data !== undefined && data.length === SHARES_LIST_PAGE_SIZE}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

const revokePublicHandle = BaseDialog.createHandle<{
  key: string;
  filename: string;
}>();

function PublicShares() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePublicShares(page);
  const { data: user } = useAuth();

  const keys = useKeys();

  const decrypted = useMemo(() => {
    if (!data || !user || !keys) return [];

    const result: PublicShareMetadata[] = [];

    for (const it of data) {
      const metadata = Envelope.decrypt(it.envelope, it.kemCipher, keys.sign.publicKey, keys.kem.privateKey);

      if (metadata.type !== 'file') continue;

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
          <EmptyTitle>You have not created any public shares</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <RevokePublicShareDialog handle={revokePublicHandle} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File name</TableHead>
            <TableHead>Shared at</TableHead>
            <TableHead>Expires at</TableHead>
            <TableHead>SID</TableHead>
            <TableHead>Action</TableHead>
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
      <div className='w-full flex flex-row justify-end items-center'>
        <ListPagination
          page={page}
          setPage={setPage}
          hasMore={data !== undefined && data.length === SHARES_LIST_PAGE_SIZE}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

export default function SharesPage() {

  return (
    <div>
      <RequireUMK />
      <Tabs defaultValue='send'>
        <TabsList className='w-full mb-4'>
          <TabsTrigger value='recv'>Received</TabsTrigger>
          <TabsTrigger value='send'>Sent</TabsTrigger>
          <TabsTrigger value='public'>Public</TabsTrigger>
        </TabsList>
        <TabsContent value='recv'>
          <SharedWithMe />
        </TabsContent>
        <TabsContent value='send'>
          <SharedByMe />
        </TabsContent>
        <TabsContent value='public'>
          <PublicShares />
        </TabsContent>
      </Tabs>
    </div>
  );
}
