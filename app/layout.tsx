
import type { Metadata } from "next";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MasterDataNavigationShell from "@/components/layout/master-data-navigation-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HEXA Core - Dynamic System Worjflow ",
  description: "ERP Distribution and Mobile Phone Trading Management System",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} min-h-full antialiased`}
    >
      <body className="min-h-screen w-full">
        <Suspense fallback={null}>
          <MasterDataNavigationShell>{children}</MasterDataNavigationShell>
        </Suspense>
      </body>
    </html>
  );
}
