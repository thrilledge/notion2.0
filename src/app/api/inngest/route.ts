import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { notifyProjectCreated } from "@/lib/inngest/functions/projects";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [notifyProjectCreated],
});
