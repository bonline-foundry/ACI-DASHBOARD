import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Wix-style "View …" link in the top-right corner of a card. */
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
