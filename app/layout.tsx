import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/lib/AuthContext";
import { StoreProvider } from "@/lib/store";
import { WeightsProvider } from "@/lib/weights";

export const metadata: Metadata = {
  title: "EPCMst",
  description: "Spot, triage and pursue major capital projects across Western Canada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <StoreProvider>
            <WeightsProvider>
              <ToastProvider>
                <AppShell>{children}</AppShell>
              </ToastProvider>
            </WeightsProvider>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
