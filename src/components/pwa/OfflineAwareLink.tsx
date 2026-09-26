"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

type OfflineAwareLinkProps = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-label" | "className" | "title"
> & {
  href: string;
  children: ReactNode;
};

export function OfflineAwareLink({ href, children, ...props }: OfflineAwareLinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
