export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8008";
function getCsrf() {
    const m = document.cookie.match(/(?:^|;\s*)ec_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}
export async function api(path, init = {}) {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
    };
    // Double-submit CSRF for mutating requests
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const csrf = getCsrf();
        if (csrf)
            headers["X-CSRF-Token"] = csrf;
    }
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...init,
        headers,
    });
    return parseResponse(res);
}
export async function apiForm(path, body) {
    const headers = {};
    const csrf = getCsrf();
    if (csrf)
        headers["X-CSRF-Token"] = csrf;
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        body,
        headers,
    });
    return parseResponse(res);
}
async function parseResponse(res) {
    if (!res.ok) {
        const raw = await res.text().catch(() => res.statusText);
        let detail = raw;
        try {
            const parsed = JSON.parse(raw);
            detail =
                typeof parsed.detail === "string"
                    ? parsed.detail
                    : JSON.stringify(parsed.detail ?? parsed);
        }
        catch {
            // Keep the raw text.
        }
        throw new Error(`${res.status} ${res.statusText}: ${detail}`);
    }
    return res.json();
}
export const fmtUSD = (cents) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
