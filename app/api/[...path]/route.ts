import { env } from "cloudflare:workers";
import { handle } from "@/lib/onboarding.mjs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return handle(request, env); }
export function POST(request: Request) { return handle(request, env); }
