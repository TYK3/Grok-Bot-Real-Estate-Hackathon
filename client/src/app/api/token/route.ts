import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";

export const dynamic = "force-dynamic";

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "ws://localhost:7880";
const API_KEY = process.env.LIVEKIT_API_KEY ?? "devkey";
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? "secret";
const AGENT_NAME = process.env.AGENT_NAME ?? "property-agent";

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id") ?? "";

  const roomName = `property-${propertyId || "unknown"}-${randomHex(4)}`;
  const identity = `customer-${randomHex(3)}`;

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity,
    name: "Customer",
  });
  at.addGrant({ roomJoin: true, room: roomName });
  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: AGENT_NAME,
        metadata: JSON.stringify({ property_id: propertyId }),
      }),
    ],
  });

  const token = await at.toJwt();

  return NextResponse.json(
    { serverUrl: LIVEKIT_URL, token, roomName },
    { headers: { "Cache-Control": "no-store" } },
  );
}
