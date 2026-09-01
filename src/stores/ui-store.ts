import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  activeModal: string | null;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarMobileOpen: (open: boolean) => void;
  openModal: (modal: string) => void;
  closeModal: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  activeModal: null,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setSidebarMobileOpen: (sidebarMobileOpen) => set({ sidebarMobileOpen }),
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
}));
