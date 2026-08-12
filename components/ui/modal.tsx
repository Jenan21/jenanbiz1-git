"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, children, onClose }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="modal-title">{title}</h2>
          <IconButton aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
