import { createApiHandlers } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createApiHandlers();
export async function GET(request: Request, context: { params: Promise<{ copyId: string }> }) {
  return handlers.passport(request, (await context.params).copyId);
}
