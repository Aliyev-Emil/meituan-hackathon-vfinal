import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cultra — AI Food Delivery & Dining Planner",
  description:
    "Cultra is your AI copilot for food delivery, restaurant picks, group orders, and outing plans in Nanshan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
      <body>
        <Nav />
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
