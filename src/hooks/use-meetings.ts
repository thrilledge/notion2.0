"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectContentBlock } from "@/hooks/use-project-content";

export interface MeetingAttendee {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

export interface MeetingListItem {
  id: string;
  name: string;
  type: string;
  eventTime: string | null;
  pageId: string | null;
  createdAt: string;
  updatedAt: string;
  attendees: MeetingAttendee[];
}

export interface MeetingDetail {
  meeting: {
    id: string;
    name: string;
    type: string;
    eventTime: string | null;
    pageId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  attendees: MeetingAttendee[];
  blocks: ProjectContentBlock[];
}

async function fetchMeetings(): Promise<MeetingListItem[]> {
  const res = await fetch("/api/meetings", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch meetings");
  const json = await res.json();
  return json.data;
}

export function useMeetings() {
  return useQuery({
    queryKey: ["meetings"],
    queryFn: fetchMeetings,
  });
}

async function fetchMeeting(id: string): Promise<MeetingDetail> {
  const res = await fetch(`/api/meetings/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch meeting");
  const json = await res.json();
  return json.data;
}

export function useMeeting(id: string | null) {
  return useQuery({
    queryKey: ["meetings", id, "detail"],
    queryFn: () => fetchMeeting(id!),
    enabled: !!id,
  });
}
