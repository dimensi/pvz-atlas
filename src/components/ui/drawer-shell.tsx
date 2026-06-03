"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export interface DrawerShellProps {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentKey?: string;
  className?: string;
  scrollClassName?: string;
}

export function DrawerShell({
  header,
  children,
  footer,
  contentKey,
  className,
  scrollClassName
}: DrawerShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [contentKey]);

  return (
    <DrawerContent className={cn("mx-auto w-full max-w-[720px]", className)}>
      {header}
      <div
        key={contentKey}
        ref={scrollRef}
        data-testid="drawer-scroll"
        className={cn("overflow-y-auto", scrollClassName)}
      >
        {children}
      </div>
      {footer ? <div data-testid="drawer-footer">{footer}</div> : null}
    </DrawerContent>
  );
}
