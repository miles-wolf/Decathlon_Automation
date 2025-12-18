import { Briefcase, Clock, Settings, Upload, History } from "lucide-react";
import { Hero } from "@/components/Hero";
import { ToolCard } from "@/components/ToolCard";

const tools = [
  {
    id: "lunchtime-jobs",
    title: "Lunchtime Job Assigner",
    description:
      "Assign and balance lunch duties across staff with one click and quick edits.",
    icon: Briefcase,
  },
  {
    id: "am-pm-jobs",
    title: "AM/PM Job Assigner",
    description:
      "Set up before/after-camp roles, rotations, and coverage at a glance.",
    icon: Clock,
  },
  {
    id: "history",
    title: "Assignment History",
    description:
      "View past assignment runs, their status, and link to Google Sheets results.",
    icon: History,
  },
  {
    id: "upload-lists",
    title: "File Manager",
    description:
      "Upload CSV or Excel files for staff names, lunchtime jobs, and AM/PM jobs.",
    icon: Upload,
    comingSoon: true,
  },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Hero />
      <main className="flex-1">
        <section id="tools" className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Available Tools
            </h2>
            <a
              href="#settings"
              className="inline-flex items-center gap-2 min-h-10 px-3 rounded-xl border hover-elevate active-elevate-2 text-sm"
              data-testid="button-manage"
            >
              <Settings className="h-4 w-4" /> Manage
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <ToolCard key={tool.id} {...tool} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
