import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SESSIONS_DIR = path.resolve(
  process.cwd(),
  process.env.SESSIONS_DIR ?? "../data/sessions",
);

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  // Only allow the room-name style ids the token route generates.
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    return NextResponse.json({ error: "invalid session id" }, { status: 400 });
  }

  const dir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(dir)) {
    return NextResponse.json(
      { exists: false, booking: null, customer: null, summary: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const booking = readJson(path.join(dir, "booking.json"));
  const customer = readJson(path.join(dir, "customer.json"));
  const summary = readText(path.join(dir, "call_summary.txt"));

  return NextResponse.json(
    { exists: true, booking, customer, summary },
    { headers: { "Cache-Control": "no-store" } },
  );
}
