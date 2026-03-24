"use client";

import { create } from "zustand";
import { ListMode, PermissionState } from "@/lib/types";

type PermissionStore = {
  permission: PermissionState;
  permissionModalOpen: boolean;
  setPermission: (permission: PermissionState) => void;
  openPermissionModal: () => void;
  closePermissionModal: () => void;
  checkPermissionAndRequestMyLocation: () => Promise<ListMode | "needModal">;
};

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  permission: "unknown",
  permissionModalOpen: false,
  setPermission: (permission) => set({ permission }),
  openPermissionModal: () => set({ permissionModalOpen: true }),
  closePermissionModal: () => set({ permissionModalOpen: false }),

  checkPermissionAndRequestMyLocation: async () => {
    const { permission } = get();
    if (permission === "granted") {
      return "myLocation";
    }

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      set({ permission: "denied", permissionModalOpen: true });
      return "needModal";
    }

    const result = await new Promise<ListMode | "needModal">((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          set({ permission: "granted" });
          resolve("myLocation");
        },
        () => {
          set({ permission: "denied", permissionModalOpen: true });
          resolve("needModal");
        },
        { timeout: 8000 }
      );
    });

    return result;
  }
}));
