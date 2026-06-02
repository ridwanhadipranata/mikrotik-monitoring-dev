"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  login as authLogin,
  logout as authLogout,
  verifyToken,
  getToken,
  type AuthUser,
} from "@/lib/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    const check = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const result = await verifyToken();
      if (result.valid && result.user) {
        setUser(result.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    };
    check();
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await authLogin(username, password);
      if (result.success && result.user) {
        setUser(result.user);
      }
      return result;
    },
    []
  );

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
    window.location.href = "/monitoring/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
