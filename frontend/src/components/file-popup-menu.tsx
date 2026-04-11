import { Pencil, Share2, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import {
  Menu as BaseMenu,
  Dialog as BaseDialog,
  AlertDialog as BaseAlertDialog,
} from "@base-ui/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import api from "@/lib/api";
import { mutate } from "@/lib/swr";
import NewShareDialog from "./dialogs/new-share";
import RenameDialog, { type RenameDialogPayload } from "./dialogs/rename";
import type { Metadata } from "@/lib/types";

type Payload = {
  type: "folder" | "file";
  id: number;
  name: string;
};

type DeletePayload = {
  id: number
} & Metadata;

const deleteHandle = BaseAlertDialog.createHandle<DeletePayload>();
const shareHandle = BaseDialog.createHandle<{ id: number; name: string }>();
const renameHandle = BaseDialog.createHandle<RenameDialogPayload>();

function DeleteDialog({
  handle,
}: {
  handle: BaseAlertDialog.Handle<DeletePayload>;
}) {
  return (
    <AlertDialog handle={handle}>
      {function Content({ payload }) {
        const [loading, setLoading] = useState(false);

        return (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure to delete this file? This action is not undoable.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                className="bg-destructive"
                onClick={async () => {
                  if (!payload) return;

                  setLoading(true);
                  if (payload.type === 'file') {
                    await api.deleteFile(payload.id);
                  }
                  else if (payload.type === 'folder') {
                    await api.deleteFolder(payload.id);
                  }
                  setLoading(false);
                  await mutate("file");
                  handle.close();
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        );
      }}
    </AlertDialog>
  );
}

export default function FilePopupMenu({
  handle,
}: {
  handle: BaseMenu.Handle<Payload>;
}) {
  return (
    <div>
      <DeleteDialog handle={deleteHandle} />
      <NewShareDialog handle={shareHandle} />
      <RenameDialog handle={renameHandle} />

      <DropdownMenu<Payload> handle={handle}>
        {({ payload }) => (
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  if (!payload) return;

                  deleteHandle.openWithPayload(payload);
                }}
                className="text-destructive"
              >
                <Trash />
                Delete
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!payload) return;
                  renameHandle.openWithPayload(payload);
                }}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!payload || payload.type !== 'file') return;
                  
                  shareHandle.openWithPayload(payload);
                }}
                disabled={payload?.type !== "file"}
              >
                <Share2 />
                Share
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </div>
  );
}
