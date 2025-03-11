import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import ToastProvider from "@/components/toastify";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Next PredictionMarket Client",
  description: "Next client for a gnosis-ctf based prediction market",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <div className="min-h-screen flex flex-col justify-between">

            <nav className="bg-gradient-to-r from-blue-500 via-purple-600 to-pink-500 text-white shadow-lg py-4">
              <div className="container mx-auto flex justify-center space-x-8">
                {[
                  { name: "Creation", href: "/creation" },
                  { name: "Trading", href: "/trading" },
                  { name: "Manage", href: "/manage" },
                ].map((tab) => (
                  <Link key={tab.name} href={tab.href} className="text-lg font-semibold hover:text-gray-300 transition-colors">
                    {tab.name}
                  </Link>
                ))}
              </div>
            </nav>

            <main className="flex-grow flex items-center justify-center p-8">
              {children}
            </main>
            <footer className="py-4 bg-gray-800 text-center text-white">
              <p>Prediction Market Platform © 2025</p>
            </footer>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
