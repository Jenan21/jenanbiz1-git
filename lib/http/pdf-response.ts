import { NextResponse } from "next/server";

/** A generated PDF, sent privately: it belongs to the person who asked for it and is never cached. */
export function pdfResponse(bytes: Uint8Array, filename: string, inline: boolean) {
  return new NextResponse(bytes as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
