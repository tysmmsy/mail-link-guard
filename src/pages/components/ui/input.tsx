// shadcn/ui component, restyled to the classic Mac OS look used across the extension pages.
import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "mac-field w-full min-w-0 selection:bg-[#ccccff] disabled:cursor-not-allowed disabled:text-platinum-dark",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
