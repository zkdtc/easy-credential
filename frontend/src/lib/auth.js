import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
const AuthCtx = createContext({ me: null, loading: true, refetch: () => { } });
export function AuthProvider({ children }) {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ["me"],
        queryFn: async () => {
            try {
                return await api("/auth/me");
            }
            catch {
                return null;
            }
        },
        retry: false,
        staleTime: 60_000,
    });
    return (_jsx(AuthCtx.Provider, { value: { me: data ?? null, loading: isLoading, refetch }, children: children }));
}
export function useAuth() {
    return useContext(AuthCtx);
}
/** Read the ec_csrf cookie (set by the backend). */
export function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)ec_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}
