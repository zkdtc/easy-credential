import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Org = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  verified: boolean;
  role: "owner" | "admin" | "issuer";
};

export type Me = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  auth_provider: string;
  default_org_id: string | null;
  orgs: Org[];
};

type AuthValue = {
  me: Me | null;
  loading: boolean;
  refetch: () => void;
};

const AuthCtx = createContext<AuthValue>({ me: null, loading: true, refetch: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/auth/me");
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  return (
    <AuthCtx.Provider value={{ me: data ?? null, loading: isLoading, refetch }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

/** Read the ec_csrf cookie (set by the backend). */
export function getCsrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)ec_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
