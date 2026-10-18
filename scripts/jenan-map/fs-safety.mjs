// File-system safety helpers shared by the offline Jenan PRO Map scripts. Linux and macOS (where production runs) keep the strict POSIX
// checks; Windows, which has no permission bits and no O_NOFOLLOW, is supported for local development only.
import { constants, lstatSync } from "node:fs";
import { open, stat } from "node:fs/promises";

export const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

/** Opens a file without following a final symlink; where the OS has no O_NOFOLLOW the symlink is refused before the open. */
export async function openNoFollow(target, flags, mode) {
  if (!NO_FOLLOW && lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("Symbolic links are refused");
  return open(target, flags | NO_FOLLOW, mode);
}

/** True when only the owner can use the directory. Windows reports fixed modes, so there the check applies to production only. */
export async function isPrivateDirectory(directory, env = process.env, platform = process.platform) {
  const info = await stat(directory);
  if (!info.isDirectory()) return false;
  if (platform === "win32") return env.NODE_ENV !== "production";
  return (info.mode & 0o077) === 0;
}
