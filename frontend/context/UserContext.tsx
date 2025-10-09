import React, { createContext, useContext, useState } from "react";

export type CurrentUser = {
  id: number;
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
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<"Visible" | "Hidden">("Visible");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  return (
    <UserContext.Provider value={{ status, setStatus, currentUser, setCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used inside UserProvider");
  return context;
};
