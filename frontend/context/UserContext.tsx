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

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

import { API_BASE_URL, updateUserVisibility, type AuthorizedFetch, type AuthorizedRequestInit } from "@/utils/api";
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
type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "refreshing";

type UserContextType = {
  status: "Visible" | "Hidden";
  setStatus: (s: "Visible" | "Hidden") => void;
  currentUser: CurrentUser | null;
  setCurrentUser: (u: CurrentUser | null) => void;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (t: { accessToken: string | null; refreshToken: string | null }) => void;
  authStatus: AuthStatus;
  isLoggedIn: boolean;
  isStatusUpdating: boolean;
  prefetchedUsers: ApiUser[] | null;
  setPrefetchedUsers: React.Dispatch<React.SetStateAction<ApiUser[] | null>>;
  isInitialized: boolean; // ? ensures tokens are restored before loading
  logout: (message?: string) => Promise<void> | void;
  fetchWithAuth: AuthorizedFetch;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

const readErrorMessage = async (response: Response): Promise<string | null> => {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data?.error === "string" ? data.error : null;
  } catch {
    return null;
  }
};

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatusRaw] = useState<"Visible" | "Hidden">("Visible");
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [prefetchedUsers, setPrefetchedUsers] = useState<ApiUser[] | null>(null);
  const [isInitialized, setIsInitialized] = useState(false); // ? new flag
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const persistTokens = useCallback(async (nextAccess: string | null, nextRefresh: string | null) => {
    try {
      if (nextAccess) {
        await AsyncStorage.setItem("accessToken", nextAccess);
      } else {
        await AsyncStorage.removeItem("accessToken");
      }

      if (nextRefresh) {
        await AsyncStorage.setItem("refreshToken", nextRefresh);
      } else {
        await AsyncStorage.removeItem("refreshToken");
      }
    } catch (err) {
      console.error("Failed to persist tokens", err);
    }
  }, []);

  /** Helper to update both tokens at once */
  const setTokens = useCallback(
    (t: { accessToken: string | null; refreshToken: string | null }) => {
      setAccessToken(t.accessToken);
      setRefreshToken(t.refreshToken);
      setAuthStatus(t.accessToken ? "authenticated" : "unauthenticated");
      void persistTokens(t.accessToken, t.refreshToken);
    },
    [persistTokens]
  );

  const logout = useCallback(
    async (message?: string) => {
      refreshPromiseRef.current = null;
      setCurrentUser(null);
      setPrefetchedUsers(null);
      setAccessToken(null);
      setRefreshToken(null);
      setStatusRaw("Hidden");
      setAuthStatus("unauthenticated");
      await persistTokens(null, null);
      if (message) {
        Alert.alert("Session expired", message);
      }
      router.replace("/login");
    },
    [persistTokens]
  );

  const refreshAccessToken = useCallback(async (): Promise<string> => {
    if (!refreshToken) {
      throw new Error("Missing refresh token");
    }
    if (refreshPromiseRef.current) {
      const existing = await refreshPromiseRef.current;
      if (!existing) throw new Error("Unable to refresh token");
      return existing;
    }

    const refreshCall = (async () => {
      setAuthStatus("refreshing");
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        const message = (await readErrorMessage(response)) ?? `Refresh failed (${response.status})`;
        throw new Error(message);
      }

      const data = (await response.json()) as { accessToken?: string; refreshToken?: string | null };
      if (!data.accessToken) {
        throw new Error("Refresh response missing access token");
      }

      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? refreshToken });
      setAuthStatus("authenticated");
      return data.accessToken;
    })()
      .catch(async (error) => {
        console.error("Token refresh failed", error);
        await logout("Session expired. Please log in again.");
        throw error;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = refreshCall;
    return refreshCall;
  }, [logout, refreshToken, setTokens]);

  const fetchWithAuth = useCallback<AuthorizedFetch>(
    async (input, init) => {
      const normalizedInit: AuthorizedRequestInit = { ...(init ?? {}) };
      const requiresAuth = normalizedInit.skipAuth !== true;
      delete normalizedInit.skipAuth;
      const { headers: initHeaders, ...restInit } = normalizedInit;
      const requestInit: RequestInit = restInit;

      const execute = async (token: string | null, allowRetry: boolean): Promise<Response> => {
        const headers = new Headers(initHeaders ?? {});
        if (requiresAuth && token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        const response = await fetch(input as Parameters<typeof fetch>[0], {
          ...requestInit,
          headers,
        });

        if (!requiresAuth || response.status !== 401) {
          return response;
        }

        if (!refreshToken || !allowRetry) {
          return response;
        }

        const nextToken = await refreshAccessToken();
        return execute(nextToken, false);
      };

      let tokenForRequest = requiresAuth ? accessToken : null;
      if (requiresAuth && !tokenForRequest && refreshToken) {
        try {
          tokenForRequest = await refreshAccessToken();
        } catch {
          tokenForRequest = null;
        }
      }

      const response = await execute(tokenForRequest, true);
      if (requiresAuth && response.status === 401) {
        await logout("Session expired. Please log in again.");
      }
      return response;
    },
    [accessToken, refreshAccessToken, refreshToken, logout]
  );

  /** Toggle user visibility (Visible / Hidden) and sync with backend */
  const setStatus = useCallback(
    (newStatus: "Visible" | "Hidden") => {
      if (isStatusUpdating) {
        console.log("? Ignored toggle spam");
        return;
      }

      if (newStatus === status) return;

      const previousStatus = status;
      const visibilityFlag = newStatus === "Visible";

      setStatusRaw(newStatus);
      setIsStatusUpdating(true);

      const finish = () => setIsStatusUpdating(false);

      // If user missing, update local state only
      if (!currentUser) {
        finish();
        return;
      }

      // Otherwise, update backend
      void (async () => {
        try {
          const updated = await updateUserVisibility(visibilityFlag, fetchWithAuth);

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
    },
    [currentUser, fetchWithAuth, isStatusUpdating, status]
  );

  /** Derived state: true if a user is currently logged in */
  const isLoggedIn = currentUser !== null;

  /** Log changes to currentUser for debugging */
  useEffect(() => {
    console.log("?? currentUser updated:", currentUser);
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

  /** ? Restore tokens from AsyncStorage on app startup */
  useEffect(() => {
    const restoreTokens = async () => {
      try {
        const storedAccess = await AsyncStorage.getItem("accessToken");
        const storedRefresh = await AsyncStorage.getItem("refreshToken");

        setAccessToken(storedAccess);
        setRefreshToken(storedRefresh);
        setAuthStatus(storedAccess ? "authenticated" : "unauthenticated");
      } catch (err) {
        console.error("Failed to restore tokens", err);
        setAuthStatus("unauthenticated");
      } finally {
        // ? Mark initialization complete whether successful or not
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
        authStatus,
        isLoggedIn,
        isStatusUpdating,
        prefetchedUsers,
        setPrefetchedUsers,
        isInitialized, // ? included in provider value
        logout,
        fetchWithAuth,
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

