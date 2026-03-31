import { Trash } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "./ui/dropdown-menu";
import { Menu as BaseMenu } from '@base-ui/react';
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react";
import api from '@/lib/api';
import { mutate } from "@/lib/swr";

type Payload = {
  id: number;
}

const deleteHandle = BaseAlertDialog.createHandle<{ id: number }>();

function DeleteDialog({ handle }: { handle: BaseAlertDialog.Handle<{ id: number }> }) {
  return (
    <AlertDialog handle={handle}>
      {function Content({ payload }) {
        const [loading, setLoading] = useState(false);

        return (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Confirm deletion
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure to delete this file? This action is not undoable.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                className='bg-destructive'
                onClick={async () => {
                  setLoading(true);
                  await api.deleteFile(payload?.id ?? 0);
                  setLoading(false);
                  await mutate('file');
                  handle.close();
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )
      }}

    </AlertDialog>
  )
}

export default function FilePopupMenu({ handle }: { handle: BaseMenu.Handle<Payload> }) {
  return (
    <div>
      <DeleteDialog handle={deleteHandle} />
      <DropdownMenu<Payload> handle={handle}>
        {({ payload }) => (
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => {
                deleteHandle.openWithPayload({ id: payload?.id ?? 0 });
              }} className='text-destructive'>
                <Trash />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </div>
  )
}