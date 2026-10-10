import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { SupabaseProvider } from "@/components/supabase-provider";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "FitGym — Admin",
  description: "Gym Management System",
  applicationName: "FitGym Admin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FitGym",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "FitGym Admin",
    description: "Gym management and member operations",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseProvider>{children}</SupabaseProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
