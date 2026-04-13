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
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "usehooks-ts";

function Content() {
  const { t } = useTranslation();
  const transfers = useAppSelector((state) => state.transfer.items);

  const items = Object.values(transfers).sort(
    (a, b) => b.createdAt - a.createdAt,
  );


  return (
    <Drawer.Content className="mx-auto h-full w-full">
      <div className="md:hidden w-12 h-1 mx-auto mb-4 rounded-full bg-gray-300" />

      <Drawer.Title className="mb-1 text-lg font-medium">
        {t("common.transferList")}
      </Drawer.Title>
      <div className="mb-6 text-base text-center">
        {items.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ArrowUpDown />
              </EmptyMedia>
              <EmptyTitle>{t("common.noActiveTransfers")}</EmptyTitle>
              <EmptyDescription>
                {t("common.transferListHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {items.map((it) => (
          <div
            className="hover:bg-accent rounded-md pt-2 pb-4 md:px-4 px-2"
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
                className="min-w-0 shrink flex-1"
              >
                <ProgressLabel className="w-full flex flex-row items-center justify-start gap-2">
                  {it.kind === "download" && (
                    <DownloadCloudIcon className="inline shrink-0" size={16} />
                  )}
                  {it.kind === "upload" && (
                    <UploadIcon className="inline shrink-0" size={16} />
                  )}
                  {it.kind === "download-share" && (
                    <Share2 className="inline shrink-0" size={16} />
                  )}
                  <span className='min-w-0 shrink overflow-hidden truncate'>
                    {it.filename}
                  </span>
                  <ProgressValue className='shrink-0' />
                </ProgressLabel>
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
                  <CircleAlert size={16} className="inline" />{" "}
                  {t("common.failedPrefix")} {it.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Drawer.Content>
  )
}

export default function TransferList() {
  const open = useAppSelector((state) => state.ui.transferListOpen);
  const dispatch = useAppDispatch();
  const sm = useMediaQuery('(width < 48rem)');

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(val) => dispatch(toggleTransferList(val))}
      swipeDirection={sm ? "down" : "right"}
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
        <Drawer.Viewport className="z-30 fixed inset-0 flex flex-col justify-end md:justify-center md:items-end">
          <Drawer.Popup className={
            "md:-mr-8 md:pl-8 md:pr-16 md:h-full md:w-[calc(60vw+3rem)] bg-background md:px-6 px-2 pt-4 " +
            "max-sm:-mb-8 my-0 w-full h-[calc(80vh+3rem)] " +
            "text-foreground overflow-y-auto overscroll-contain touch-auto " +
            "transform-[translateY(var(--drawer-swipe-movement-y))] md:transform-[translateX(var(--drawer-swipe-movement-x))] " +
            "transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none " +
            "data-ending-style:transform-[translateY(calc(100%-3rem+2px))] md:data-ending-style:transform-[translateX(calc(100%-3rem+2px))] " +
            "data-starting-style:transform-[translateY(calc(100%-3rem+2px))] md:data-starting-style:transform-[translateX(calc(100%-3rem+2px))] " +
            "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] dark:outline dark:outline-gray-900"
          }>
            <Content />
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
