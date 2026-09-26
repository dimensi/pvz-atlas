"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { useSyncOverview } from "@/components/sync/SyncOverviewProvider";

type OfflineAwareLinkProps = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-label" | "className" | "title"
> & {
  href: string;
  children: ReactNode;
};

export function OfflineAwareLink({ href, children, ...props }: OfflineAwareLinkProps) {
  const { online } = useSyncOverview();

  return online
    ? <Link href={href} {...props}>{children}</Link>
    : <a href={href} {...props}>{children}</a>;
}
