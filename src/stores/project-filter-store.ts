import { create } from "zustand";
import { persist } from "zustand/middleware";

type ViewMode = "table" | "kanban";

interface FilterState {
  status: string[];
  result: string[];
  assigneeId: string | null;
  search: string;
  viewMode: ViewMode;
  setStatus: (status: string[]) => void;
  setResult: (result: string[]) => void;
  setAssignee: (assigneeId: string | null) => void;
  setSearch: (search: string) => void;
  setViewMode: (mode: ViewMode) => void;
  reset: () => void;
}

export const useProjectFilters = create<FilterState>()(
  persist(
    (set) => ({
      status: [],
      result: [],
      assigneeId: null,
      search: "",
      viewMode: "table",
      setStatus: (status) => set({ status }),
      setResult: (result) => set({ result }),
      setAssignee: (assigneeId) => set({ assigneeId }),
      setSearch: (search) => set({ search }),
      setViewMode: (viewMode) => set({ viewMode }),
      reset: () =>
        set({
          status: [],
          result: [],
          assigneeId: null,
          search: "",
          viewMode: "table",
        }),
    }),
    {
      name: "project-filters",
    }
  )
);
