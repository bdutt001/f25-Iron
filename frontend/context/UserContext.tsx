/**
 * UserContext.tsx
 * -------------------------------------------------------------
 * Provides user-related state and actions throughout the app.
 * - Stores authentication tokens and current user information
 * - Handles visibility toggling with backend updates
 * - Tracks login status and prefetches nearby users
 * - Includes initialization flag to ensure tokens are restored
 * -------------------------------------------------------------
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { updateUserProfile, updateUserVisibility } from "@/utils/api";
import type { ApiUser } from "../utils/geo";

/** Shape of the currently authenticated user */
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

/** Context state shape shared throughout the app */
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
  isInitialized: boolean; // ✅ ensures tokens are restored before loading
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatusRaw] = useState<"Visible" | "Hidden">("Visible");
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [prefetchedUsers, setPrefetchedUsers] = useState<ApiUser[] | null>(null);
  const [isInitialized, setIsInitialized] = useState(false); // ✅ new flag

  /** Helper to update both tokens at once */
  const setTokens = (t: { accessToken: string | null; refreshToken: string | null }) => {
    setAccessToken(t.accessToken);
    setRefreshToken(t.refreshToken);
  };

  /** Toggle user visibility (Visible / Hidden) and sync with backend */
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

    // If user or token missing, update local state only
    if (!currentUser || !accessToken) {
      setCurrentUser((prev) => (prev ? { ...prev, visibility: visibilityFlag } : prev));
      finish();
      return;
    }

    // Otherwise, update backend
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

  /** Derived state: true if a user is currently logged in */
  const isLoggedIn = currentUser !== null;

  /** Log changes to currentUser for debugging */
  useEffect(() => {
    console.log("👤 currentUser updated:", currentUser);
  }, [currentUser]);

  /** Sync local visibility state when currentUser changes */
  useEffect(() => {
    if (!currentUser) {
      setStatusRaw("Hidden");
      setPrefetchedUsers(null);
      return;
    }

    setStatusRaw(currentUser.visibility === false ? "Hidden" : "Visible");
  }, [currentUser?.visibility]);

  /** ✅ Restore tokens from AsyncStorage on app startup */
  useEffect(() => {
    const restoreTokens = async () => {
      try {
        const storedAccess = await AsyncStorage.getItem("accessToken");
        const storedRefresh = await AsyncStorage.getItem("refreshToken");

        if (storedAccess || storedRefresh) {
          setTokens({
            accessToken: storedAccess,
            refreshToken: storedRefresh,
          });
        }
      } catch (err) {
        console.error("Failed to restore tokens", err);
      } finally {
        // ✅ Mark initialization complete whether successful or not
        setIsInitialized(true);
      }
    };

    restoreTokens();
  }, []);

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
        isStatusUpdating,
        prefetchedUsers,
        setPrefetchedUsers,
        isInitialized, // ✅ included in provider value
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

/** Hook for easy access to the user context */
export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
};
