import { FolderInput, Pencil, Share2, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
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
} from "@/shared/components/ui/alert-dialog";
import api from "@/shared/lib/api";
import { mutate } from "@/shared/lib/swr";
import NewShareDialog from "@/features/shares/dialogs/new-share-dialog";
import RenameDialog, { type RenameDialogPayload } from "@/features/drive/dialogs/rename-dialog";
import MoveDialog, { type MoveDialogPayload } from "@/features/drive/dialogs/move-dialog";

type Payload = {
  type: "folder" | "file";
  id: number;
  name: string;
  kemCipher: Uint8Array;
  envelope: Uint8Array;
};

type DeletePayload = {
  type: "folder" | "file";
  id: number;
  name: string;
};

const deleteHandle = BaseAlertDialog.createHandle<DeletePayload>();
const shareHandle = BaseDialog.createHandle<{ id: number; name: string }>();
const renameHandle = BaseDialog.createHandle<RenameDialogPayload>();
const moveHandle = BaseDialog.createHandle<MoveDialogPayload>();

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
                Are you sure you want to delete this item? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                className="bg-destructive"
                onClick={async () => {
                  if (!payload) return;

                  setLoading(true);
                  if (payload.type === "file") {
                    await api.deleteFile(payload.id);
                  } else if (payload.type === "folder") {
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
      <MoveDialog handle={moveHandle} />

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
                  if (!payload) return;
                  moveHandle.openWithPayload(payload);
                }}
              >
                <FolderInput />
                Move
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!payload || payload.type !== "file") return;

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
