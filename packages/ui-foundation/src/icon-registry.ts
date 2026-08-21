export type IconId =
  | "sparkles"
  | "user"
  | "mail"
  | "lock"
  | "shield"
  | "arrow"
  | "globe"
  | "settings";

const iconPaths: Record<IconId, string> = {
  sparkles: "M12 2l1.8 3.9L18 7.2l-3.2 2.3L16 14l-4-2.2L8 14l1.2-4.5L6 7.2l4.2-1.3L12 2z",
  user: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z",
  mail: "M4 6h16v12H4z M4 7l8 6 8-6",
  lock: "M7 11h10v9H7z M9 11V8a3 3 0 1 1 6 0v3",
  shield: "M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z",
  arrow: "M4 12h14 M12 7l6 5-6 5",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18",
  settings: "M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm8 4-2.1-.7a7.8 7.8 0 0 0-.7-1.7l1.1-1.9-1.4-1.4-1.9 1.1a7.8 7.8 0 0 0-1.7-.7L12 4 11.3 1.9h-2.6L8 4l-1.7.7-1.9-1.1-1.4 1.4 1.1 1.9-.7 1.7L1.9 12l2.1.7.7 1.7-1.1 1.9 1.4 1.4 1.9-1.1 1.7.7.7 2.1h2.6l.7-2.1 1.7-.7 1.9 1.1 1.4-1.4-1.1-1.9.7-1.7z",
};

export function getIconPath(id: IconId): string {
  return iconPaths[id];
}

export function listRegisteredIcons(): readonly IconId[] {
  return Object.freeze(Object.keys(iconPaths) as IconId[]);
}
