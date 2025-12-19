import { Sun, Moon, Menu } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Link, useLocation } from "wouter";
import decathlonLogo from "@assets/image_1766113212503.png";

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-sky-100 dark:bg-sky-900/30 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 hover-elevate active-elevate-2 rounded-xl px-2 py-1 -ml-2" data-testid="link-home">
          <img src={decathlonLogo} alt="Decathlon Sports Club" className="h-10 w-10 rounded-full object-cover" />
          <div className="font-semibold tracking-tight">
            Decathlon Sports Camp Director Tools
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link
            href="/"
            className={`hover-elevate active-elevate-2 px-3 py-2 rounded-xl transition-colors ${
              location === "/" ? "text-foreground" : "text-muted-foreground"
            }`}
            data-testid="link-tools"
          >
            Tools
          </Link>
          <a
            href="#about"
            className="text-muted-foreground hover-elevate active-elevate-2 px-3 py-2 rounded-xl transition-colors"
            data-testid="link-about"
          >
            About
          </a>
          <a
            href="#settings"
            className="text-muted-foreground hover-elevate active-elevate-2 px-3 py-2 rounded-xl transition-colors"
            data-testid="link-settings"
          >
            Settings
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 min-h-10 px-3 rounded-xl border hover-elevate active-elevate-2"
            aria-label="Toggle theme"
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span className="hidden sm:inline text-sm">
              {theme === "dark" ? "Light" : "Dark"}
            </span>
          </button>
          <button
            className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-xl border hover-elevate active-elevate-2"
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
