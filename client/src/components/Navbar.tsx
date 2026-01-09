import { Menu } from "lucide-react";
import { Link, useLocation } from "wouter";
import decathlonLogo from "@assets/image_1766113212503.png";

export function Navbar() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-[#47c8f5] dark:bg-[#47c8f5] backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 hover-elevate active-elevate-2 rounded-xl px-2 py-1 -ml-2" data-testid="link-home">
          <img src={decathlonLogo} alt="Decathlon Sports Club" className="h-10 w-10 rounded-full object-cover" />
          <div className="font-semibold tracking-tight text-slate-900">
            Decathlon Sports Camp Director Tools
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link
            href="/"
            className={`hover-elevate active-elevate-2 px-3 py-2 rounded-xl transition-colors ${
              location === "/" ? "text-slate-900 font-medium" : "text-slate-700"
            }`}
            data-testid="link-tools"
          >
            Tools
          </Link>
          <Link
            href="/about"
            className={`hover-elevate active-elevate-2 px-3 py-2 rounded-xl transition-colors ${
              location === "/about" ? "text-slate-900 font-medium" : "text-slate-700"
            }`}
            data-testid="link-about"
          >
            About
          </Link>
          <Link
            href="/settings"
            className={`hover-elevate active-elevate-2 px-3 py-2 rounded-xl transition-colors ${
              location === "/settings" ? "text-slate-900 font-medium" : "text-slate-700"
            }`}
            data-testid="link-settings"
          >
            Settings
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <button
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-slate-400 text-slate-900 hover-elevate active-elevate-2"
            aria-label="Open menu"
            data-testid="button-menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
