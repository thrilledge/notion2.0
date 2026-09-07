import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { r2Client, R2_CONFIG } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";
import { isAllowedUpload } from "@/lib/security";

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^[\w-]+\/[\w.+-]+$/),
  size: z.number().int().positive().max(50 * 1024 * 1024),
  folder: z.enum(["attachments", "avatars"]).default("attachments"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { filename, contentType, size, folder } = parsed.data;

  if (!isAllowedUpload(filename)) {
    return NextResponse.json(
      { error: "File type is not allowed" },
      { status: 400 }
    );
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${folder}/${user.id}/${crypto.randomUUID()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });

  try {
    const url = await getSignedUrl(r2Client, command, { expiresIn: 300 });

    return NextResponse.json({
      url,
      key,
      publicUrl: `${R2_CONFIG.publicUrl}/${key}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }
}
