import { NextResponse } from "next/server";
import { getAuthz } from "@/lib/authz";

export async function GET() {
  const authz = await getAuthz();
  if (!authz) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    data: {
      userId: authz.userId,
      email: authz.email,
      isGlobalOwner: authz.isGlobalOwner,
      roles: Object.fromEntries(authz.memberships),
    },
  });
}
