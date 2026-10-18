// Classic Mac OS window and group box, shared by the options page and the popup.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MacWindow({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mac-window", className)}>
      <div className="mac-titlebar">
        <span>{title}</span>
      </div>
      <div className="px-4 pt-1 pb-4">{children}</div>
    </div>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mac-group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Status({ message, kind }: { message: string; kind: "ok" | "error" | "" }) {
  return (
    <p
      role="status"
      className={cn(
        "min-h-[22px] text-[14px]",
        kind === "error" && "text-alert",
        kind === "ok" && "text-ok",
      )}
    >
      {message}
    </p>
  );
}
