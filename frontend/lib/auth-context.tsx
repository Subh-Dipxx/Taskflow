"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, setAccessToken } from "./api-client";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/refresh`,
          { method: "POST", credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.access_token);
          const me = await apiFetch<User>("/auth/me");
          setUser(me);
        }
      } catch {
        /* not logged in */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(data.access_token);
      const me = await apiFetch<User>("/auth/me");
      setUser(me);
      router.push("/dashboard");
    },
    [router]
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await apiFetch<{ access_token: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setAccessToken(data.access_token);
      const me = await apiFetch<User>("/auth/me");
      setUser(me);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setAccessToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
