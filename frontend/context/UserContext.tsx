import React, { createContext, useContext, useState } from "react";

export type CurrentUser = {
  id: number;
  username?: string | null;
  email: string;
  name?: string | null;
  createdAt?: string;
  interestTags?: string[];
  profilePicture?: string | null; // ✅ from your branch
  trustScore?: number;            // ✅ from main
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
};


const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatusRaw] = useState<"Visible" | "Hidden">("Visible");
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const setTokens = (t: { accessToken: string | null; refreshToken: string | null }) => {
    setAccessToken(t.accessToken);
    setRefreshToken(t.refreshToken);
  };

  // ✅ Debounced version of setStatus
  const setStatus = (newStatus: "Visible" | "Hidden") => {
    if (isStatusUpdating) {
      console.log("⏳ Ignored toggle spam");
      return;
    }
    setIsStatusUpdating(true);
    setStatusRaw(newStatus);

    // Wait 1.5 seconds before allowing another toggle
    setTimeout(() => setIsStatusUpdating(false), 1500);
  };

  const isLoggedIn = currentUser !== null;

  React.useEffect(() => {
    console.log("👤 currentUser updated:", currentUser);
  }, [currentUser]);

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
