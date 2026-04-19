import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-display font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-pop hover:shadow-pop-lg hover:-translate-y-0.5",
        secondary:
          "bg-secondary text-secondary-foreground shadow-pop-sm hover:shadow-pop hover:-translate-y-0.5",
        accent:
          "bg-accent text-accent-foreground shadow-pop-sm hover:shadow-pop hover:-translate-y-0.5",
        destructive:
          "bg-destructive text-destructive-foreground shadow-pop-sm hover:brightness-105",
        outline:
          "border-2 border-border bg-card shadow-pop-sm hover:bg-muted hover:-translate-y-0.5",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline font-semibold",
      },
      size: {
        default: "h-11 px-5 text-sm [&_svg]:size-4",
        sm: "h-9 px-3.5 text-sm rounded-md [&_svg]:size-4",
        lg: "h-14 px-7 text-base [&_svg]:size-5",
        xl: "h-16 px-8 text-lg [&_svg]:size-6",
        icon: "h-11 w-11 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
