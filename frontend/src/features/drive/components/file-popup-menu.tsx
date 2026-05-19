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
import DeleteDialog, { type Payload as DeletePayload } from "../dialogs/delete-dialog";
import NewShareDialog, { type Payload as SharePayload } from "@/features/shares/dialogs/new-share-dialog";
import RenameDialog, { type RenameDialogPayload } from "@/features/drive/dialogs/rename-dialog";
import MoveDialog, { type MoveDialogPayload } from "@/features/drive/dialogs/move-dialog";

export type Payload = {
  type: "folder" | "file";
  id: number;
  name: string;
  kemCipher: Uint8Array;
  envelope: Uint8Array;
};

const deleteHandle = BaseAlertDialog.createHandle<DeletePayload>();
const shareHandle = BaseDialog.createHandle<SharePayload>();
const renameHandle = BaseDialog.createHandle<RenameDialogPayload>();
const moveHandle = BaseDialog.createHandle<MoveDialogPayload>();

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
