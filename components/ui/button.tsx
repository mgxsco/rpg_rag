import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 tracking-wide",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-[hsl(25_70%_30%)] text-primary-foreground border-2 border-[hsl(45_80%_45%)] shadow-md hover:from-[hsl(25_70%_40%)] hover:to-primary hover:shadow-lg",
        destructive:
          "bg-gradient-to-b from-destructive to-[hsl(0_65%_35%)] text-destructive-foreground border-2 border-[hsl(0_50%_30%)] hover:from-[hsl(0_65%_50%)] hover:to-destructive",
        outline:
          "border-2 border-border bg-gradient-to-b from-background to-[hsl(35_25%_90%)] hover:bg-accent hover:text-accent-foreground hover:border-primary/50",
        secondary:
          "bg-gradient-to-b from-secondary to-[hsl(35_20%_80%)] text-secondary-foreground border border-border hover:from-[hsl(35_25%_88%)] hover:to-secondary",
        ghost: "hover:bg-accent/50 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline hover:text-[hsl(40_80%_45%)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-sm px-3",
        lg: "h-11 rounded-sm px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
