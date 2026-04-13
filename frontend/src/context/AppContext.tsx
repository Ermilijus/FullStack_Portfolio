import { createContext, useCallback, useContext, useState, ReactNode, useEffect } from "react";
import { API_BASE_URL } from "../api";

interface User {
  id: string;
  email: string;
  username: string;
  role?: string;
  avatar?: string;
  currency?: number;
  specialCurrency?: number;
}

interface AppContextType {
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
  authReady: boolean;
  refreshUser: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem("authToken");
    const savedUser = localStorage.getItem("authUser");

    const restoreSession = async () => {
      if (!savedToken) {
        setAuthReady(true);
        return;
      }

      setTokenState(savedToken);
      setUserState(savedUser ? JSON.parse(savedUser) : null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/me`, {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });

        if (!response.ok) {
          throw new Error("Session expired");
        }

        const data = await response.json() as { user: User | null };
        if (!data.user) {
          throw new Error("Session expired");
        }

        setUserState(data.user);
        localStorage.setItem("authUser", JSON.stringify(data.user));
      } catch {
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");
        setTokenState(null);
        setUserState(null);
      } finally {
        setAuthReady(true);
      }
    };

    void restoreSession();
  }, []);

  const setToken = (newToken: string | null) => {
    setTokenState(newToken);
    if (newToken) {
      localStorage.setItem("authToken", newToken);
    } else {
      localStorage.removeItem("authToken");
    }
  };

  const setUser = (newUser: User | null) => {
    setUserState(newUser);
    if (newUser) {
      localStorage.setItem("authUser", JSON.stringify(newUser));
    } else {
      localStorage.removeItem("authUser");
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    const currentToken = token;
    if (!currentToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json() as { user: User | null };
      if (data.user) {
        setUserState(data.user);
        localStorage.setItem("authUser", JSON.stringify(data.user));
      }
    } catch {
      // silently ignore transient failures
    }
  }, [token]);

  return (
    <AppContext.Provider
      value={{
        token,
        user,
        setToken,
        setUser,
        logout,
        isAuthenticated: !!token,
        authReady,
        refreshUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
};