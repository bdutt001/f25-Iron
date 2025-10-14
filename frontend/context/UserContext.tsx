import React, { createContext, useContext, useState } from "react";

export type CurrentUser = {
  id: number;
  username?: string | null;
  email: string;
  name?: string | null;
  createdAt?: string;
  interestTags?: string[];
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
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"Visible" | "Hidden">("Visible");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    // For demo purposes, auto-login as the first user (Alice)
    // In a real app, this would check for stored auth tokens
    return {
      id: 21,
      email: "alice@example.com", 
      name: "Alice Johnson",
      interestTags: ["Coffee", "Dogs", "Hiking"]
    };
  });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const setTokens = (t: { accessToken: string | null; refreshToken: string | null }) => {
    setAccessToken(t.accessToken);
    setRefreshToken(t.refreshToken);
  };

  const isLoggedIn = currentUser !== null;

  return (
    <UserContext.Provider value={{ 
      status, 
      setStatus, 
      currentUser, 
      setCurrentUser, 
      accessToken, 
      refreshToken, 
      setTokens,
      isLoggedIn 
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used inside UserProvider");
  return context;
};
