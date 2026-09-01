import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.auth.signOut();
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL!;
  return NextResponse.redirect(`${origin}/login`);
}
