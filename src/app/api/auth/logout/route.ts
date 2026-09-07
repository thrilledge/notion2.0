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

  // Never trust the Origin/Referer headers for the redirect target (open
  // redirect / phishing); always return the caller to our own login page.
  return NextResponse.redirect(new URL("/login", request.url));
}
