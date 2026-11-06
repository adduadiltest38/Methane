import { handle, json } from "@/lib/http";
import { getMeta } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => json(await getMeta()));
}
