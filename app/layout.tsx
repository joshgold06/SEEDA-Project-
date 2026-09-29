import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Signal Scout",
  description: "Spot, triage and pursue Alberta water and wastewater opportunities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <StoreProvider><div className="flex min-h-screen"><Sidebar /><div className="flex min-w-0 flex-1">{children}</div></div></StoreProvider>
      </body>
    </html>
  );
}
