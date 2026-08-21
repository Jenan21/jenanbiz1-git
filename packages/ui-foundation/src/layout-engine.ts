export type ShellKind = "auth" | "section" | "workspace" | "admin";

export interface ShellLayout {
  kind: ShellKind;
  columns: number;
  maxWidth: number;
  hasSidebar: boolean;
  hasTopbar: boolean;
}

const shellLayouts: Record<ShellKind, ShellLayout> = {
  auth: { kind: "auth", columns: 3, maxWidth: 1680, hasSidebar: true, hasTopbar: true },
  section: { kind: "section", columns: 2, maxWidth: 1600, hasSidebar: true, hasTopbar: true },
  workspace: { kind: "workspace", columns: 1, maxWidth: 1760, hasSidebar: false, hasTopbar: true },
  admin: { kind: "admin", columns: 2, maxWidth: 1760, hasSidebar: true, hasTopbar: true },
};

export function getShellLayout(kind: ShellKind): ShellLayout {
  return shellLayouts[kind];
}
