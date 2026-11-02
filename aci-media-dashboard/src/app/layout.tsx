import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "ACI Media Dashboard", template: "%s · ACI Media" },
  description: "Plan, spend, performance, digital, competitors and billing in one place",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f5f4ef] text-stone-900">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-stone-200 bg-[#faf9f5] md:w-60 md:shrink-0 md:border-b-0 md:border-r">
            <Sidebar />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
