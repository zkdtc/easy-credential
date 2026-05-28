import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Credentials from "./pages/Credentials";
import IssueCredential from "./pages/IssueCredential";
import BatchIssue from "./pages/BatchIssue";
import IssuerOrg from "./pages/IssuerOrg";
import PublicCredential from "./pages/PublicCredential";
import Login from "./pages/Login";

const queryClient = new QueryClient();
const appBase = import.meta.env.VITE_APP_BASE ?? "";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={appBase}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route index element={<Dashboard />} />
              <Route path="login" element={<Login />} />
              <Route path="wallet" element={<Wallet />} />
              <Route path="org" element={<IssuerOrg />} />
              <Route path="credentials" element={<Credentials />} />
              <Route path="issue" element={<IssueCredential />} />
              <Route path="issue/batch" element={<BatchIssue />} />
            </Route>
            <Route path="/c/:slug" element={<PublicCredential />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
