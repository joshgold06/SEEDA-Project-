import type { Metadata } from "next";
import Script from "next/script";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/lib/AuthContext";
import { FiltersProvider } from "@/lib/filters";
import { ResearchQueueProvider } from "@/lib/research/queue";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { THEME_INIT_SCRIPT } from "@/lib/themeScript";
import { WeightsProvider } from "@/lib/weights";

export const metadata: Metadata = {
  title: "EPCMst",
  description: "Spot, triage and pursue major capital projects across Western Canada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the init script sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <AuthProvider>
            <StoreProvider>
              <WeightsProvider>
                <ToastProvider>
                  <FiltersProvider>
                    <ResearchQueueProvider>
                      <AppShell>{children}</AppShell>
                    </ResearchQueueProvider>
                  </FiltersProvider>
                </ToastProvider>
              </WeightsProvider>
            </StoreProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
