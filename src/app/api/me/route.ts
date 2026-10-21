import { connection } from "next/server";
import { getAccess } from "@/lib/access";

export async function GET() {
  await connection();
  return Response.json(await getAccess(), { headers: { "Cache-Control": "private, no-store" } });
}
