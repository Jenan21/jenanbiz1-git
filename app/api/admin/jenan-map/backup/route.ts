import { NextRequest } from "next/server";
import { z } from "zod";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema } from "@/services/jenan-map/contracts";
import { createFullBackup, listBackups, validateBackupFolder } from "@/services/jenan-map/backup-service";
import { restoreBackupAsCandidate, restoreSchema } from "@/services/jenan-map/restore";

export const runtime = "nodejs";
// Backing up or restoring a country archive reads and checks gigabytes; the platform default would cut it off half way.
export const maxDuration = 300;
const createSchema = z.object({ action: z.literal("create"), releaseId: idSchema, confirmation: z.literal("CREATE FULL BACKUP") }).strict();
const validateSchema = z.object({ action: z.literal("validate"), folder: z.string().min(1).max(220) }).strict();

/** Lists the backups on this server, or reports that no backup folder is configured. */
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    return json(await listBackups());
  } catch (error) { return failure(error); }
}

/**
 * Create a Full Jenan PRO Map Backup, validate one, or restore one as a NEW unreviewed candidate (Validate → Restore → Preview → Approve →
 * Publish). None of these changes what customers see, and a restore never writes to the published release.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => null);
    const create = createSchema.safeParse(body);
    if (create.success) return json(await createFullBackup(create.data.releaseId, auth.user!.id), 201);
    const validate = validateSchema.safeParse(body);
    if (validate.success) return json(await validateBackupFolder(validate.data.folder, auth.user!.id));
    const restore = restoreSchema.safeParse(body);
    if (restore.success) return json(await restoreBackupAsCandidate(restore.data.folder, auth.user!.id), 201);
    return json({ error: "INVALID_BACKUP_REQUEST" }, 400);
  } catch (error) { return failure(error); }
}