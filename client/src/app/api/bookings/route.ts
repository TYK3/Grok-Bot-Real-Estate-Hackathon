import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SESSIONS_DIR = path.resolve(
  process.cwd(),
  process.env.SESSIONS_DIR ?? "../data/sessions",
);

type Booking = {
  sessionId: string;
  propertyId: string | null;
  date: string | null;
  time: string | null;
  customerName: string | null;
  status: string | null;
  recordedAt: string | null;
};

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Viewings booked by the voice agent (one booking.json per call session). */
export async function GET() {
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return NextResponse.json({ bookings: [] });
  }

  const bookings: Booking[] = [];
  for (const id of dirs) {
    const b = readJson(path.join(SESSIONS_DIR, id, "booking.json"));
    if (!b) continue;
    const session = readJson(path.join(SESSIONS_DIR, id, "session.json"));
    bookings.push({
      sessionId: id,
      propertyId: str(b.property_id) ?? str(session?.property_id),
      date: str(b.date),
      time: str(b.time),
      // Only the name is exposed here; contact details stay on disk.
      customerName: str(b.customer_name),
      status: str(b.status),
      recordedAt: str(b.recorded_at),
    });
  }
  bookings.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return NextResponse.json({ bookings });
}
