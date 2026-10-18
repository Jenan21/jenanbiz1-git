import { NextRequest } from "next/server";
import { z } from "zod";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema } from "@/services/jenan-map/contracts";
import { createFullBackup, listBackups, validateBackupFolder } from "@/services/jenan-map/backup-service";

export const runtime = "nodejs";
const createSchema = z.object({ action: z.literal("create"), releaseId: idSchema, confirmation: z.literal("CREATE FULL BACKUP") }).strict();
const validateSchema = z.object({ action: z.literal("validate"), folder: z.string().min(1).max(220) }).strict();

/** Lists the backups on this server. */
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    return json({ backups: await listBackups() });
  } catch (error) { return failure(error); }
}

/** Create Full Jenan PRO Map Backup, or validate one before a restore. Neither changes what customers see. */
export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => null);
    const create = createSchema.safeParse(body);
    if (create.success) return json(await createFullBackup(create.data.releaseId, auth.user!.id), 201);
    const validate = validateSchema.safeParse(body);
    if (validate.success) return json(await validateBackupFolder(validate.data.folder, auth.user!.id));
    return json({ error: "INVALID_BACKUP_REQUEST" }, 400);
  } catch (error) { return failure(error); }
}