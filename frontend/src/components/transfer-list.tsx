import { Drawer } from "@base-ui/react";
import { Button } from "./ui/button";
import {
  ArrowUpDown,
  Ban,
  Check,
  CircleAlert,
  CircleDashed,
  DownloadCloudIcon,
  Share2,
  SquareCheck,
  SquareDashed,
  UploadIcon,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/stores";
import { toggleTransferList } from "@/stores/ui";
import { Spinner } from "./ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { Progress, ProgressLabel, ProgressValue } from "./ui/progress";

export default function TransferList() {
  const transfers = useAppSelector((state) => state.transfer.items);
  const open = useAppSelector((state) => state.ui.transferListOpen);
  const dispatch = useAppDispatch();

  const items = Object.values(transfers).sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(val) => dispatch(toggleTransferList(val))}
      swipeDirection="right"
    >
      <Drawer.Trigger
        render={
          <Button variant="outline" size="icon">
            <ArrowUpDown />
          </Button>
        }
      />
      <Drawer.Portal>
        <Drawer.Backdrop className="z-20 [--backdrop-opacity:0.2] [--bleed:3rem] dark:[--backdrop-opacity:0.7] fixed inset-0 min-h-dvh bg-black opacity-[calc(var(--backdrop-opacity)*(1-var(--drawer-swipe-progress)))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] supports-[-webkit-touch-callout:none]:absolute" />
        <Drawer.Viewport className="z-30 fixed inset-0 flex flex-col justify-center items-end">
          <Drawer.Popup className="md:-mr-8 md:pl-8 md:pr-16 h-full w-[80vw] md:w-[calc(60vw+3rem)] bg-background px-6 pt-4 text-foreground overflow-y-auto overscroll-contain touch-auto transform-[translateX(var(--drawer-swipe-movement-x))] transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-ending-style:transform-[translateX(calc(100%-3rem+2px))] data-starting-style:transform-[translateX(calc(100%-3rem+2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] dark:outline dark:outline-gray-900">
            <Drawer.Content className="mx-auto h-full w-full">
              <Drawer.Title className="mb-1 text-lg font-medium">
                Transfer List
              </Drawer.Title>
              <div className="mb-6 text-base text-center">
                {items.length === 0 && (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ArrowUpDown />
                      </EmptyMedia>
                      <EmptyTitle>No active transfers yet</EmptyTitle>
                      <EmptyDescription>
                        Upload or download to create transfer tasks.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                {items.map((it) => (
                  <div
                    className="hover:bg-accent rounded-md pt-2 pb-4 px-4"
                    key={it.id}
                  >
                    <div className="h-12 w-full flex flex-row gap-4">
                      <div className="flex justify-center items-center w-8 h-full">
                        {it.status === "completed" && <Check />}
                        {it.status === "running" && <Spinner />}
                        {it.status === "error" && <Ban />}
                        {it.status === "pending" && <CircleDashed />}
                      </div>
                      <Progress
                        value={(it.sent / it.size) * 100}
                        className="flex-1"
                      >
                        <ProgressLabel className="flex flex-row items-center justify-start gap-2">
                          {it.kind === "download" && (
                            <DownloadCloudIcon className="inline" size={16} />
                          )}
                          {it.kind === "upload" && (
                            <UploadIcon className="inline" size={16} />
                          )}
                          {it.kind === "download-share" && (
                            <Share2 className="inline" size={16} />
                          )}
                          {it.filename}
                        </ProgressLabel>
                        <ProgressValue />
                      </Progress>
                    </div>

                    <div className="w-full flex flex-row gap-4">
                      <div className="w-8" />
                      {it.status !== "error" && (
                        <div className="flex flex-row items-start flex-wrap gap-1">
                          {it.chunks.map((val, i) => (
                            <span
                              key={i}
                              className="h-5 w-5 flex flex-col justify-center items-center"
                            >
                              {val.status === "completed" && (
                                <SquareCheck size={20} />
                              )}
                              {val.status === "pending" && (
                                <SquareDashed size={20} />
                              )}
                              {val.status === "running" && (
                                <Spinner className="w-5 h-5" />
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {it.status === "error" && (
                        <div className="flex flex-row items-center text-destructive gap-2">
                          <CircleAlert size={16} className="inline" /> Failed:{" "}
                          {it.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
