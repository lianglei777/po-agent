"use client";

import { Flex, Modal, Typography } from "antd";
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

type DialogProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

function Dialog({ children, defaultOpen = false, onOpenChange, open }: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <DialogContext.Provider value={{ open: currentOpen, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("Dialog components must be used within Dialog");
  return context;
}

function DialogTrigger({ children }: { asChild?: boolean; children: ReactNode }) {
  const { setOpen } = useDialogContext();
  if (!isValidElement(children)) return null;
  return cloneElement(children as ReactElement<{ onClick?: () => void }>, {
    onClick: () => setOpen(true),
  });
}

function DialogClose({ children }: { asChild?: boolean; children: ReactNode }) {
  const { setOpen } = useDialogContext();
  if (!isValidElement(children)) return null;
  return cloneElement(children as ReactElement<{ onClick?: () => void }>, {
    onClick: () => setOpen(false),
  });
}

function DialogPortal({ children }: { children?: ReactNode }) {
  return children;
}

function DialogOverlay() {
  return null;
}

type DialogContentProps = {
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
} & (
  | { showCloseButton?: true; closeLabel: string }
  | { showCloseButton: false; closeLabel?: never }
);

function resolveDialogWidth(className?: string) {
  if (className?.includes("max-w-5xl")) return 1024;
  if (className?.includes("420px")) return 420;
  if (className?.includes("max-w-md")) return 448;
  return 520;
}

function DialogContent({
  children,
  className,
  closeLabel,
  overlayClassName,
  showCloseButton = true,
}: DialogContentProps) {
  const { open, setOpen } = useDialogContext();
  const zIndex = className?.includes("z-[1101]") ? 1101 : 1000;

  return (
    <Modal
      centered
      className={className}
      closable={
        showCloseButton
          ? { "aria-label": closeLabel ?? "Close" }
          : false
      }
      footer={null}
      keyboard={false}
      mask={{ closable: false }}
      onCancel={() => setOpen(false)}
      open={open}
      rootClassName={overlayClassName}
      width={resolveDialogWidth(className)}
      zIndex={zIndex}
    >
      {children}
    </Modal>
  );
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <Flex className={className} gap="small" vertical {...props} />
  );
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <Flex className={className} gap="small" justify="end" wrap {...props} />
  );
}

function DialogTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <Typography.Title className={className} level={4} style={{ margin: 0 }} {...props}>
      {children}
    </Typography.Title>
  );
}

function DialogDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Typography.Paragraph className={className} style={{ margin: 0 }} type="secondary" {...props}>
      {children}
    </Typography.Paragraph>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
