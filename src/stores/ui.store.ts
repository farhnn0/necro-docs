/**
 * UI Store - Zustand State Management
 * Manages UI state: modals, panels, notifications, preferences
 */

import { create } from 'zustand';
import { Notification } from '@/lib/types';

interface UIState {
  // Modals
  openModals: Set<string>;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;

  // Panels
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  expandPanel: (id: string) => void;
  collapsePanel: (id: string) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;

  // Theme & preferences
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Modals
  openModals: new Set(),
  openModal: (id) =>
    set((state) => ({
      openModals: new Set(state.openModals).add(id),
    })),
  closeModal: (id) =>
    set((state) => {
      const newModals = new Set(state.openModals);
      newModals.delete(id);
      return { openModals: newModals };
    }),
  closeAllModals: () => set({ openModals: new Set() }),

  // Panels
  expandedPanels: new Set(['explorer', 'graph']),
  togglePanel: (id) =>
    set((state) => {
      const newPanels = new Set(state.expandedPanels);
      if (newPanels.has(id)) {
        newPanels.delete(id);
      } else {
        newPanels.add(id);
      }
      return { expandedPanels: newPanels };
    }),
  expandPanel: (id) =>
    set((state) => ({
      expandedPanels: new Set(state.expandedPanels).add(id),
    })),
  collapsePanel: (id) =>
    set((state) => {
      const newPanels = new Set(state.expandedPanels);
      newPanels.delete(id);
      return { expandedPanels: newPanels };
    }),

  // Notifications
  notifications: [],
  addNotification: (notification) =>
    set((state) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newNotifications = [...state.notifications, { ...notification, id }];
      
      // Auto-remove after duration
      if (notification.duration) {
        setTimeout(() => {
          set((s) => ({
            notifications: s.notifications.filter((n) => n.id !== id),
          }));
        }, notification.duration);
      }

      return { notifications: newNotifications };
    }),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // Theme & preferences
  sidebarOpen: true,
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
