"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background,transform,box-shadow] duration-200 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gold text-black hover:bg-gold-soft shadow-[0_4px_16px_rgba(212,175,55,0.25)]",
        ghost:
          "bg-transparent text-foreground/80 hover:bg-white/5 hover:text-foreground",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-white/5",
        fold:
          "bg-action-fold/90 text-white hover:bg-action-fold shadow-[0_4px_16px_rgba(220,38,38,0.25)]",
        call:
          "bg-action-call/90 text-white hover:bg-action-call shadow-[0_4px_16px_rgba(22,163,74,0.25)]",
        raise:
          "bg-action-raise/90 text-black hover:bg-action-raise shadow-[0_4px_16px_rgba(245,158,11,0.3)]",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-xs",
        lg: "h-14 px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
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
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
