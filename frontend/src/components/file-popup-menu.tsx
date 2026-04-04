import { Share2, Trash } from "lucide-react";
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

type Payload = {
  id: number;
  filename: string;
};

const deleteHandle = BaseAlertDialog.createHandle<{
  id: number;
  filename: string;
}>();
const shareHandle = BaseDialog.createHandle<{ id: number; filename: string }>();

function DeleteDialog({
  handle,
}: {
  handle: BaseAlertDialog.Handle<{ id: number; filename: string }>;
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

      <DropdownMenu<Payload> handle={handle}>
        {({ payload }) => (
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  deleteHandle.openWithPayload({
                    id: payload?.id ?? 0,
                    filename: payload?.filename ?? "",
                  });
                }}
                className="text-destructive"
              >
                <Trash />
                Delete
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  shareHandle.openWithPayload({
                    id: payload?.id ?? 0,
                    filename: payload?.filename ?? "",
                  });
                }}
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
