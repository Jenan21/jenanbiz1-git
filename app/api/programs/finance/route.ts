import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { createFinancialEntry, listFinancialEntries } from "@/services/programs/financial-entry-service";

const entrySchema = z.object({
  organizationId: z.string().cuid(),
  type: z.enum(["INCOME", "EXPENSE"]),
  amountMinor: z.number().int().positive().max(1_000_000_000),
  currency: z.string().trim().length(3),
  description: z.string().trim().min(2).max(1_000),
  occurredAt: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId || !z.string().cuid().safeParse(organizationId).success) return NextResponse.json({ success: false, message: "Valid organizationId required" }, { status: 400 });
  try {
    return NextResponse.json({ success: true, entries: await listFinancialEntries(organizationId, user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finance entries could not be loaded";
    return NextResponse.json({ success: false, message }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid financial entry" }, { status: 400 });
  try {
    const input = parsed.data;
    const entry = await createFinancialEntry({ ...input, currency: input.currency.toUpperCase(), occurredAt: new Date(input.occurredAt), userId: user.id });
    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Financial entry could not be created";
    return NextResponse.json({ success: false, message }, { status: 403 });
  }
}