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

type Payload = {
  type: "folder" | "file";
  id: number;
  name: string;
};

const deleteHandle = BaseAlertDialog.createHandle<{
  id: number;
  name: string;
}>();
const shareHandle = BaseDialog.createHandle<{ id: number; filename: string }>();
const renameHandle = BaseDialog.createHandle<RenameDialogPayload>();

function DeleteDialog({
  handle,
}: {
  handle: BaseAlertDialog.Handle<{ id: number; name: string }>;
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
                  setLoading(true);
                  await api.deleteFile(payload?.id ?? 0);
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
                  deleteHandle.openWithPayload({
                    id: payload?.id ?? 0,
                    name: payload?.name ?? "",
                  });
                }}
                className="text-destructive"
              >
                <Trash />
                Delete
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!payload?.id || !payload?.type) return;
                  renameHandle.openWithPayload({
                    id: payload.id,
                    name: payload.name,
                    type: payload.type,
                  });
                }}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (payload?.type !== "file") return;
                  shareHandle.openWithPayload({
                    id: payload?.id ?? 0,
                    filename: payload?.name ?? "",
                  });
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
