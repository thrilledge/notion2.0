import { inngest } from "@/lib/inngest/client";

export const notifyProjectCreated = inngest.createFunction(
  {
    id: "notify-project-created",
    retries: 2,
    triggers: [{ event: "app/project.created" }],
  },
  async ({ event, step }) => {
    const { name, projectId, createdBy } = event.data;

    await step.run("log-project-created", async () => {
      console.log(
        `[project.created] ${name} (${projectId}) created by ${createdBy}`
      );
      return { name, projectId, createdBy };
    });

    return { success: true, projectId };
  }
);
