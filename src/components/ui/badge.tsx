import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/ui"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-sky-accent focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-sky-accent text-canvas hover:bg-sky-accent/80",
        secondary:
          "border-transparent bg-surface text-ink hover:bg-surface/80",
        destructive:
          "border-transparent bg-crimson text-canvas hover:bg-crimson/80",
        outline: "text-ink border-hairline",
        success:
          "border-transparent bg-emerald text-canvas hover:bg-emerald/80",
        warning:
          "border-transparent bg-amber text-ink hover:bg-amber/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
