import React, { createContext, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";

import { updateUserProfile, updateUserVisibility } from "@/utils/api";
import type { ApiUser } from "../utils/geo";

export type CurrentUser = {
  id: number;
  username?: string | null;
  email: string;
  name?: string | null;
  createdAt?: string;
  interestTags?: string[];
  profilePicture?: string | null;
  trustScore?: number;            
  visibility?: boolean;
};

type UserContextType = {
  status: "Visible" | "Hidden";
  setStatus: (s: "Visible" | "Hidden") => void;
  currentUser: CurrentUser | null;
  setCurrentUser: (u: CurrentUser | null) => void;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (t: { accessToken: string | null; refreshToken: string | null }) => void;
  isLoggedIn: boolean;
  isStatusUpdating: boolean;
  prefetchedUsers: ApiUser[] | null;
  setPrefetchedUsers: (users: ApiUser[] | null) => void;
};


const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatusRaw] = useState<"Visible" | "Hidden">("Visible");
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [prefetchedUsers, setPrefetchedUsers] = useState<ApiUser[] | null>(null);

  const setTokens = (t: { accessToken: string | null; refreshToken: string | null }) => {
    setAccessToken(t.accessToken);
    setRefreshToken(t.refreshToken);
  };

  const setStatus = (newStatus: "Visible" | "Hidden") => {
    if (isStatusUpdating) {
      console.log("⏳ Ignored toggle spam");
      return;
    }

    if (newStatus === status) return;

    const previousStatus = status;
    const visibilityFlag = newStatus === "Visible";

    setStatusRaw(newStatus);
    setIsStatusUpdating(true);

    const finish = () => setIsStatusUpdating(false);

    if (!currentUser || !accessToken) {
      setCurrentUser((prev) => (prev ? { ...prev, visibility: visibilityFlag } : prev));
      finish();
      return;
    }

    void (async () => {
      try {
        const updated = await updateUserVisibility(visibilityFlag, accessToken);

        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                ...updated,
                interestTags: updated.interestTags ?? prev.interestTags,
                profilePicture: updated.profilePicture ?? prev.profilePicture,
                visibility: updated.visibility ?? visibilityFlag,
              }
            : updated
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update visibility";
        console.error("Visibility toggle failed", error);
        Alert.alert("Visibility", message);
        setStatusRaw(previousStatus);
      } finally {
        finish();
      }
    })();
  };

  const isLoggedIn = currentUser !== null;

  useEffect(() => {
    console.log("👤 currentUser updated:", currentUser);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setStatusRaw("Hidden");
      setPrefetchedUsers(null);
      return;
    }

    setStatusRaw(currentUser.visibility === false ? "Hidden" : "Visible");
  }, [currentUser?.visibility]);

  return (
    <UserContext.Provider
      value={{
        status,
        setStatus,
        currentUser,
        setCurrentUser,
        accessToken,
        refreshToken,
        setTokens,
        isLoggedIn,
        isStatusUpdating, // ✅ add this
        prefetchedUsers,
        setPrefetchedUsers,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
};
