import NewFolderDialog from "@/components/dialogs/new-folder";
import UploadDialog from "@/components/dialogs/upload";
import useFiles from "@/hooks/use-files";
import { useAppDispatch, useAppSelector, useKeys } from "@/stores";
import { Fragment, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatError, formatSize } from "@/lib/utils";
import RequireKeys from "@/components/require-umk";
import { pop, popUntil, push, reset } from "@/stores/path";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Download, EllipsisVertical, Folder, FolderUp } from "lucide-react";
import { transferBridge } from "@/lib/transfer-bridge";
import { toggleTransferList } from "@/stores/ui";
import { Menu } from "@base-ui/react";
import FilePopupMenu from "@/components/file-popup-menu";
import ExtIcon from "@/components/icon";
import { toast } from "sonner";
import { Envelope } from "@/lib/crypto_wrappers";

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

function FileList() {
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
      for (const { size, id, createdAt, envelope, kemCipher } of data.files) {
        const metadata = Envelope.decrypt(envelope, kemCipher, keys.sign.publicKey, keys.kem.privateKey);

        const item = {
          ...metadata,
          size,
          id,
          createdAt: new Date(createdAt),
          kemCipher,
          envelope,
        };

        result.push(item);
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
                {".."}
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
    </div>
  );
}

function Breadcrumbs() {
  const path = useAppSelector((state) => state.path.value);
  const dispatch = useAppDispatch();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            className="w-8 text-center select-none cursor-pointer"
            onClick={() => dispatch(reset())}
          >
            /
          </BreadcrumbLink>
        </BreadcrumbItem>

        {path.map((it) => (
          <Fragment key={it.id}>
            <BreadcrumbSeparator />

            <BreadcrumbItem>
              <BreadcrumbLink
                className="select-none cursor-pointer"
                onClick={() => dispatch(popUntil(it.id))}
              >
                {it.folderName}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default function DrivePage() {
  return (
    <div className="flex flex-col h-full">
      <RequireKeys />

      <div className="flex flex-row justify-start items-center gap-4 mb-4">
        <UploadDialog />
        <NewFolderDialog />
      </div>

      <Breadcrumbs />

      <FileList />
    </div>
  );
}
