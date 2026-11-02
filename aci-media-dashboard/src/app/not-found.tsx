import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
      <p className="font-medium text-gray-900">Page not found</p>
      <p className="text-sm text-gray-500">This address does not exist in the dashboard.</p>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>Go to Home</Link>
    </div>
  );
}
