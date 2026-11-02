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
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-sidebar-border bg-sidebar md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
            <Sidebar />
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
