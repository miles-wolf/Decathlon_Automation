import React from "react";
import { Briefcase, Sun, Moon, Clock, Menu, Settings } from "lucide-react";

const tools = [
  {
    id: "lunchtime-jobs",
    title: "Lunchtime Job Assignment",
    description:
      "Assign and balance lunch duties across staff with one click and quick edits.",
    icon: Briefcase,
    cta: "Open Tool",
  },
  {
    id: "am-pm-jobs",
    title: "AM/PM Job Assignment",
    description:
      "Set up before/after-camp roles, rotations, and coverage at a glance.",
    icon: Clock,
    cta: "Open Tool",
  },
];

function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/70 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-sm" />
          <div className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Decathlon Sports Camp Director Tools
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a href="#tools" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors">Tools</a>
          <a href="#about" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors">About</a>
          <a href="#settings" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors">Settings</a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [dark]);
  return (
    <button
      onClick={() => setDark((d) => !d)}
      className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline text-sm">{dark ? "Light" : "Dark"}</span>
    </button>
  );
}

function Hero() {
  return (
    <section className="border-b border-zinc-200/70 dark:border-zinc-800/80 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Simple, modular tools for running Decathlon Sports Camp
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
              Start with job assignments today. Add schedule builders, tournament team builders, digitized binders and more later - all in one place.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToolCard({ icon: Icon, title, description, href = "#" }) {
  return (
    <a
      href={href}
      className="group block rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-content-center bg-zinc-100 dark:bg-zinc-800">
          <Icon className="h-5 w-5 text-zinc-800 dark:text-zinc-100" />
        </div>
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {title}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <span className="inline-flex items-center text-sm font-medium text-emerald-600 group-hover:translate-x-0.5 transition-transform">
          Open <span className="ml-1">→</span>
        </span>
      </div>
    </a>
  );
}

function ToolsGrid() {
  return (
    <section id="tools" className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Available Tools
        </h2>
        <a
          href="#settings"
          className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-sm"
        >
          <Settings className="h-4 w-4" /> Manage
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((t) => (
          <ToolCard
            key={t.id}
            icon={t.icon}
            title={t.title}
            description={t.description}
            href={`#/${t.id}`}
          />)
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-200/70 dark:border-zinc-800/80">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Decathlon Sports Camp Director Tools</p>
          <div className="flex items-center gap-6">
            <a href="#privacy" className="hover:text-zinc-800 dark:hover:text-zinc-200">Privacy</a>
            <a href="#terms" className="hover:text-zinc-800 dark:hover:text-zinc-200">Terms</a>
            <a href="#support" className="hover:text-zinc-800 dark:hover:text-zinc-200">Support</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Navbar />
      <Hero />
      <ToolsGrid />
      <Footer />
    </div>
  );
}
