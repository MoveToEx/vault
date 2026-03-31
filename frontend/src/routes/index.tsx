import NewFolderDialog from "@/components/dialogs/new-folder";
import UploadDialog from "@/components/dialogs/upload";
import useFiles from "@/hooks/use-files";
import { aeadDecrypt, kdf } from "@/lib/crypto";
import { useAppDispatch, useAppSelector } from "@/stores"
import { from_base64 } from "libsodium-wrappers-sumo";
import { Fragment, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatSize, getIcon } from "@/lib/utils";
import RequireUMK from "@/components/require-umk";
import { pop, popUntil, push, reset } from "@/stores/path";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Download, EllipsisVertical, Folder, FolderUp } from "lucide-react";
import { transferBridge } from "@/lib/transfer-bridge";
import { toggleTransferList } from "@/stores/ui";
import { Menu } from "@base-ui/react";
import FilePopupMenu from "@/components/file-popup-menu";

type Item = {
  type: 'file',
  name: string,
  mime: string,
  size: number,
  id: number,
} | {
  type: 'folder',
  name: string,
  id: number,
};

const fileMenuHandle = Menu.createHandle<{ id: number }>();

function FileList() {
  const umk = useAppSelector(state => state.umk.value);
  const path = useAppSelector(state => state.path.value);
  const dispatch = useAppDispatch();

  const { data, isLoading } = useFiles(path.length === 0 ? 0 : path[path.length - 1].id);

  const decrypted = useMemo<Item[]>(() => {
    if (!data || !umk) return [];
    const result: Item[] = [];

    const kek = kdf(from_base64(umk), 'KEK');

    for (const { encryptedMetadata, nonce, size, id } of data) {
      const plaintext = aeadDecrypt(
        from_base64(encryptedMetadata),
        kek,
        from_base64(nonce)
      );

      const metadata = {
        ...JSON.parse(new TextDecoder().decode(plaintext)),
        size,
        id,
      };

      result.push(metadata);
    }

    return result.sort((x, y) => {
      if (x.type != y.type) {
        if (x.type === 'folder') return -1;
        return 1;
      }
      if (x.name > y.name) return 1;
      return -1;
    });
  }, [umk, data]);

  return (
    <div>
      <FilePopupMenu handle={fileMenuHandle} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-32'>Name</TableHead>
            <TableHead>MIME</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {path.length > 0 && !isLoading && (
            <TableRow className='h-12' onDoubleClick={() => dispatch(pop())}>
              <TableCell className='font-medium'>
                <FolderUp size={16} className='inline mx-2' />
                ..
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
            </TableRow>
          )}
          {decrypted.map(val => (
            <TableRow
              key={`${val.type}:${val.id}`}
              className='group h-12'
              onDoubleClick={() => {
                if (val.type === 'folder') {
                  dispatch(push({
                    folderName: val.name,
                    id: val.id,
                  }));
                }
              }}>
              <TableCell className='font-medium'>
                {val.type === 'folder' && <Folder size={16} className='inline mx-2' />}
                {val.type === 'file' && getIcon(val.name)}
                {val.name}
              </TableCell>
              <TableCell className='text-secondary-foreground'>
                {val.type === 'file' && val.mime}
                {val.type === 'folder' && <i>Folder</i>}
              </TableCell>
              <TableCell>
                {val.type === 'file' && <span>{formatSize(val.size)}</span>}
              </TableCell>
              <TableCell className='flex flex-row items-center justify-start gap-2'>
                {val.type === 'file' && (
                  <Button
                    className='duration-[0] invisible group-hover:visible'
                    variant='outline'
                    size='icon-sm'
                    onClick={() => {
                      transferBridge.enqueueDownload(val.id, from_base64(umk ?? ''));
                      dispatch(toggleTransferList(true));
                    }}>
                    <Download />
                  </Button>
                )}
                <Menu.Trigger
                  handle={fileMenuHandle}
                  payload={{ id: val.id }}
                  render={
                    <Button className='duration-[0] invisible group-hover:visible' variant='outline' size='icon-sm'>
                      <EllipsisVertical />
                    </Button>
                  } />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Breadcrumbs() {
  const path = useAppSelector(state => state.path.value);
  const dispatch = useAppDispatch();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink className='w-8 text-center select-none cursor-pointer' onClick={() => dispatch(reset())}>
            /
          </BreadcrumbLink>
        </BreadcrumbItem>

        {path.map(it => (
          <Fragment key={it.id}>
            <BreadcrumbSeparator />

            <BreadcrumbItem>
              <BreadcrumbLink className='select-none cursor-pointer' onClick={() => dispatch(popUntil(it.id))}>
                {it.folderName}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export default function IndexPage() {
  return (
    <div>
      <RequireUMK />
      <div className='flex flex-row justify-start items-center gap-4 mb-4'>
        <UploadDialog />
        <NewFolderDialog />
      </div>

      <Breadcrumbs />
      <FileList />
    </div>
  )
}