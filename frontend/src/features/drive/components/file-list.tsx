import useFiles from "@/features/drive/hooks/use-files";
import { useAppDispatch, useAppSelector, useKeys } from "@/shared/stores";
import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { formatError, formatSize } from "@/shared/lib/utils";
import { pop, push } from "@/shared/stores/path";
import { Button } from "@/shared/components/ui/button";
import { Download, EllipsisVertical, Files, Folder, FolderUp } from "lucide-react";
import { transferBridge } from "@/features/transfer/lib/transfer-bridge";
import { toggleTransferList } from "@/shared/stores/ui";
import { Menu } from "@base-ui/react";
import FilePopupMenu from "@/features/drive/components/file-popup-menu";
import ExtIcon from "@/features/drive/components/file-icon";
import { toast } from "sonner";
import { Envelope } from "@/shared/lib/crypto_wrappers";
import { Spinner } from "@/shared/components/ui/spinner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";

type Item =
  | {
    type: "file";
    name: string;
    size: number;
    id: number;
    createdAt: Date;
    kemCipher: Uint8Array;
    envelope: Uint8Array;
  }
  | {
    type: "folder";
    name: string;
    id: number;
    createdAt: Date;
    kemCipher: Uint8Array;
    envelope: Uint8Array;
  };

const fileMenuHandle = Menu.createHandle<{
  type: "folder" | "file";
  id: number;
  name: string;
  kemCipher: Uint8Array;
  envelope: Uint8Array;
}>();

function splitExt(filename: string): [string, string] {
  const a = filename.split('.');
  if (a.length === 1) return [filename, ''];
  return [a.slice(0, -1).join('.'), '.' + a[a.length - 1]];
}

export default function FileList() {
  const keys = useKeys();
  const path = useAppSelector((state) => state.path.value);
  const dispatch = useAppDispatch();

  const { data, isLoading } = useFiles(
    path.length === 0 ? 0 : path[path.length - 1].id,
  );

  const decrypted = useMemo<Item[]>(() => {
    if (!data || !keys) return [];
    const result: Item[] = [];

    try {
      for (const { id, createdAt, envelope, kemCipher } of data.folders) {
        const metadata = Envelope.decrypt(envelope, kemCipher, keys.sign.publicKey, keys.kem.privateKey);

        result.push({
          ...metadata,
          type: 'folder',
          id,
          createdAt: new Date(createdAt),
          kemCipher,
          envelope,
        });
      }

      for (const { size, id, createdAt, envelope, kemCipher } of data.files) {
        const metadata = Envelope.decrypt(envelope, kemCipher, keys.sign.publicKey, keys.kem.privateKey);

        result.push({
          ...metadata,
          type: 'file',
          size,
          id,
          createdAt: new Date(createdAt),
          kemCipher,
          envelope,
        });
      }

      return result.sort((x, y) => {
        if (x.type != y.type) {
          if (x.type === "folder") return -1;
          return 1;
        }
        if (x.name > y.name) return 1;
        return -1;
      });
    }
    catch (e) {
      toast.error(formatError(e));

      return [];
    }
  }, [keys, data]);

  return (
    <div>
      <FilePopupMenu handle={fileMenuHandle} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-lg">Name</TableHead>
            <TableHead>Created at</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {path.length > 0 && !isLoading && (
            <TableRow className="h-12" onDoubleClick={() => dispatch(pop())}>
              <TableCell className="font-medium">
                <FolderUp size={16} className="inline mx-2" />
                ..
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
            </TableRow>
          )}
          {decrypted.map((val) => (
            <TableRow
              key={`${val.type}:${val.id}`}
              className="group h-12"
              onDoubleClick={() => {
                if (val.type === "folder") {
                  dispatch(
                    push({
                      folderName: val.name,
                      id: val.id,
                    }),
                  );
                }
              }}
            >
              <TableCell className="font-medium flex flex-row items-center w-lg">
                {val.type === "folder" && (
                  <Folder size={16} className="inline mx-2 shrink-0" />
                )}
                {val.type === "file" && (
                  <ExtIcon filename={val.name} size={16} className='inline mx-2 shrink-0' />
                )}
                <span className='truncate'>
                  {splitExt(val.name)[0]}
                </span>
                <span>
                  {splitExt(val.name)[1]}
                </span>
              </TableCell>
              <TableCell className="text-secondary-foreground">
                {val.createdAt.toLocaleString()}
              </TableCell>
              <TableCell>
                {val.type === "file" && <span>{formatSize(val.size)}</span>}
              </TableCell>
              <TableCell className="flex flex-row items-center justify-start gap-2">
                {val.type === "file" && (
                  <Button
                    className="duration-[0] invisible group-hover:visible"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => {
                      if (!keys) return;

                      transferBridge.enqueueDownload(
                        val.id,
                        keys.sign.publicKey,
                        keys.kem,
                      );
                      dispatch(toggleTransferList(true));
                    }}
                  >
                    <Download />
                  </Button>
                )}
                <Menu.Trigger
                  handle={fileMenuHandle}
                  payload={val}
                  render={
                    <Button
                      className="duration-[0] invisible group-hover:visible"
                      variant="outline"
                      size="icon-sm"
                    >
                      <EllipsisVertical />
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {isLoading && (
        <div className='h-32 w-full flex flex-row items-center justify-center gap-4'>
          <Spinner /> Loading
        </div>
      )}
      {!isLoading && (data?.files.length ?? 0) + (data?.folders.length ?? 0) === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Files />
            </EmptyMedia>
            <EmptyTitle>No files yet</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}