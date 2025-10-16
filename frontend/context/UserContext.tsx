import React, { createContext, useContext, useState } from "react";

export type CurrentUser = {
  id: number;
  username?: string | null;
  email: string;
  name?: string | null;
  createdAt?: string;
  interestTags?: string[];
  profilePicture?: string | null;
};

type UserContextType = {
  status: "Visible" | "Hidden";
  setStatus: (s: "Visible" | "Hidden") => void;
  currentUser: CurrentUser | null;
  setCurrentUser: (u: CurrentUser | null) => void;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (t: { accessToken: string | null; refreshToken: string | null }) => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"Visible" | "Hidden">("Visible");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const setTokens = (t: { accessToken: string | null; refreshToken: string | null }) => {
    setAccessToken(t.accessToken);
    setRefreshToken(t.refreshToken);
  };

  return (
    <UserContext.Provider value={{ status, setStatus, currentUser, setCurrentUser, accessToken, refreshToken, setTokens }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used inside UserProvider");
  return context;
};
