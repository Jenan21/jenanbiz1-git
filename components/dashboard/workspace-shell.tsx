"use client";

import { useState, type ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar, type NavItem } from "@/components/layout/sidebar";
import { Icon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import type { Locale } from "@/types/i18n";

interface WorkspaceShellProps {
  locale: Locale;
  languageLabel: string;
  greeting: string;
  userLabel: string;
  logoutLabel: string;
  footerLabel: string;
  items: NavItem[];
  activeHref: string;
  children: ReactNode;
}

export function WorkspaceShell({ children, ...props }: WorkspaceShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="workspace">
      <Sidebar
        items={props.items}
        activeHref={props.activeHref}
        footerLabel={props.footerLabel}
        className={open ? "is-open" : undefined}
      />
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace__main">
        <Header
          locale={props.locale}
          languageLabel={props.languageLabel}
          greeting={props.greeting}
          userLabel={props.userLabel}
          logoutLabel={props.logoutLabel}
          onMenu={() => setOpen(true)}
        />
        <div className="workspace__content">{children}</div>
      </div>
      {open && (
        <IconButton
          className="sidebar-close"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        >
          <Icon name="x" />
        </IconButton>
      )}
    </div>
  );
}
