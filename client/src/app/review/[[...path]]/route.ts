import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Serves the teammate's static review workbench (conflict-resolution-ui/) from
 * the Next app so "Open review workbench" works without a separate server.
 * The workbench loads samples via ../fact_record/, so that folder is exposed
 * too. Both live at the repo root, one level above client/.
 */
const REPO_ROOT = path.resolve(process.cwd(), "..");
const ALLOWED_ROOTS = ["conflict-resolution-ui", "fact_record"];
const ENTRY = "conflict-resolution-ui/index.html";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const parts = (await params).path ?? [];
  const url = new URL(req.url);

  if (parts.length === 0) return NextResponse.redirect(new URL(`/review/${ENTRY}${url.search}`, url));
  if (!ALLOWED_ROOTS.includes(parts[0])) return new NextResponse("Not found", { status: 404 });

  const target = path.resolve(REPO_ROOT, ...parts);
  const root = path.resolve(REPO_ROOT, parts[0]);
  if (target !== root && !target.startsWith(root + path.sep)) return new NextResponse("Not found", { status: 404 });

  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
      // Redirect to index.html so the page's relative URLs resolve inside the folder.
      return NextResponse.redirect(new URL(`/review/${[...parts, "index.html"].join("/")}${url.search}`, url));
    }
    const body = await fs.readFile(target);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
