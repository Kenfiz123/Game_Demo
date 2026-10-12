import { createApiHandlers } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createApiHandlers();
export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  return handlers.profile(request, (await context.params).username);
}
