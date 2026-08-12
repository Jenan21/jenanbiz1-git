"use client";

import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, icon, hint, type, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className={cn("field__control", className)}>
        {icon}
        <input
          ref={ref}
          type={isPassword && visible ? "text" : type}
          {...props}
        />
        {isPassword && (
          <IconButton
            type="button"
            className="field__action"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((value) => !value)}
          >
            <Icon name={visible ? "eyeOff" : "eye"} />
          </IconButton>
        )}
      </span>
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
});
