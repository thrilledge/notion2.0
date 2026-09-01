export interface ProjectTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  defaultStatus: "not_started" | "in_progress" | "done" | "archived";
  defaultResult:
    | "company_work"
    | "not_started"
    | "stuck"
    | "pending_review"
    | "in_progress"
    | "upcoming_renewal"
    | "done"
    | null;
  summary: string;
  suggestedBlocks: { type: string; text: string }[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "project-management",
    name: "Project Management",
    emoji: "📋",
    description: "Track milestones, scope, owners and deliverables across a client build.",
    defaultStatus: "not_started",
    defaultResult: "not_started",
    summary:
      "Define the project scope, key milestones, deliverables and the people responsible for each. Update the Result property as work progresses.",
    suggestedBlocks: [
      { type: "heading", text: "Goals" },
      { type: "bulleted_list_item", text: "Define the primary goal for this project." },
      { type: "bulleted_list_item", text: "Agree on success metrics with the client." },
      { type: "heading", text: "Milestones" },
      { type: "bulleted_list_item", text: "Kickoff / discovery" },
      { type: "bulleted_list_item", text: "Design review" },
      { type: "bulleted_list_item", text: "Build & test" },
      { type: "bulleted_list_item", text: "Launch" },
    ],
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    emoji: "📝",
    description: "Capture agenda, decisions, action items and attendees.",
    defaultStatus: "in_progress",
    defaultResult: "in_progress",
    summary:
      "Jot down the agenda, key decisions and action items from the meeting.",
    suggestedBlocks: [
      { type: "heading", text: "Agenda" },
      { type: "bulleted_list_item", text: "Recap of previous actions" },
      { type: "bulleted_list_item", text: "Open questions" },
      { type: "heading", text: "Decisions" },
      { type: "bulleted_list_item", text: "Record any decisions agreed in the meeting." },
      { type: "heading", text: "Action items" },
      { type: "bulleted_list_item", text: "Assign owners and due dates." },
    ],
  },
  {
    id: "course-planner",
    name: "Course Planner",
    emoji: "📚",
    description: "Plan modules, resources and lessons for a learning course.",
    defaultStatus: "not_started",
    defaultResult: "not_started",
    summary:
      "Outline the course structure, modules, lessons and supporting resources.",
    suggestedBlocks: [
      { type: "heading", text: "Course outline" },
      { type: "bulleted_list_item", text: "Module 1 — Introduction" },
      { type: "bulleted_list_item", text: "Module 2 — Core concepts" },
      { type: "bulleted_list_item", text: "Module 3 — Project" },
      { type: "heading", text: "Resources" },
      { type: "bulleted_list_item", text: "Reading list" },
      { type: "bulleted_list_item", text: "Video library" },
    ],
  },
  {
    id: "task-manager",
    name: "Task Manager",
    emoji: "✅",
    description: "Break work into focused tasks with owners and due dates.",
    defaultStatus: "not_started",
    defaultResult: "not_started",
    summary:
      "List out every task required to finish this piece of work, assign owners and keep statuses current.",
    suggestedBlocks: [
      { type: "heading", text: "Tasks" },
      { type: "to_do", text: "First task" },
      { type: "to_do", text: "Second task" },
      { type: "to_do", text: "Third task" },
      { type: "heading", text: "Notes" },
      { type: "bulleted_list_item", text: "Add any context needed by the team." },
    ],
  },
  {
    id: "weekly-planner",
    name: "Weekly Planner",
    emoji: "📅",
    description: "Plan out priorities and time for the week.",
    defaultStatus: "in_progress",
    defaultResult: "in_progress",
    summary:
      "Set the week's top priorities and schedule time blocks against them.",
    suggestedBlocks: [
      { type: "heading", text: "This week's priorities" },
      { type: "bulleted_list_item", text: "Priority 1" },
      { type: "bulleted_list_item", text: "Priority 2" },
      { type: "bulleted_list_item", text: "Priority 3" },
      { type: "heading", text: "Blockers" },
      { type: "bulleted_list_item", text: "Note anything that could block progress." },
    ],
  },
  {
    id: "goal-tracker",
    name: "Goal Tracker",
    emoji: "🎯",
    description: "Set goals, track progress and record outcomes.",
    defaultStatus: "in_progress",
    defaultResult: "in_progress",
    summary:
      "Write the goal, define how progress is measured and update the Result as you move toward done.",
    suggestedBlocks: [
      { type: "heading", text: "Goal" },
      { type: "bulleted_list_item", text: "What are we trying to achieve?" },
      { type: "heading", text: "How we measure it" },
      { type: "bulleted_list_item", text: "Define the metrics / milestones." },
      { type: "heading", text: "Next steps" },
      { type: "bulleted_list_item", text: "First concrete action." },
    ],
  },
];

export const EMPTY_TEMPLATE: ProjectTemplate | null = null;
