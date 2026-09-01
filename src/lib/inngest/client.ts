import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "notion-project-manager",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
