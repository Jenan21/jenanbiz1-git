import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotificationStatus } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { db } from "@/lib/db";

const readSchema = z.object({ notificationId: z.string().cuid() });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id, status: { not: NotificationStatus.ARCHIVED } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.notification.count({ where: { userId: user.id, status: NotificationStatus.UNREAD } }),
  ]);
  return NextResponse.json({ success: true, notifications, unreadCount }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid notification request" }, { status: 400 });
  const notification = await db.notification.updateMany({
    where: { id: parsed.data.notificationId, userId: user.id, status: NotificationStatus.UNREAD },
    data: { status: NotificationStatus.READ, readAt: new Date() },
  });
  if (!notification.count) return NextResponse.json({ success: false, message: "Unread notification not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}