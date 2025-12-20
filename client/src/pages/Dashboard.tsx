import { Briefcase, Clock, Upload, Calendar, Trophy, BookOpen } from "lucide-react";
import { Hero } from "@/components/Hero";
import { ToolCard } from "@/components/ToolCard";

const tools = [
  {
    id: "lunchtime-jobs",
    title: "Lunchtime Job Assigner",
    description:
      "Assign and balance lunch duties across staff with one click and quick edits.",
    icon: Briefcase,
    iconSize: 24,
  },
  {
    id: "am-pm-jobs",
    title: "AM/PM Job Assigner",
    description:
      "Assign before and after camp roles with one click and quick edits.",
    icon: Clock,
    iconSize: 24,
  },
  {
    id: "upload-lists",
    title: "File Manager",
    description:
      "Upload documentation such as staff lists, lunchtime and ampm job lists and other specifications.",
    icon: Upload,
    iconSize: 20,
    comingSoon: true,
  },
  {
    id: "schedule-builder",
    title: "Schedule Builder",
    description:
      "Create the daily schedule for the entire session or for special Fridays.",
    icon: Calendar,
    iconSize: 22,
    comingSoon: true,
  },
  {
    id: "tournament-builder",
    title: "Tournament Builder",
    description:
      "Create fair teams and brackets for soccer, football, basketball tournaments and more.",
    icon: Trophy,
    iconSize: 22,
    comingSoon: true,
  },
  {
    id: "digitized-binder",
    title: "Digitized Binder",
    description:
      "Build and edit a digitized binder for staff to easily find whatever they're looking for at a moment's notice.",
    icon: BookOpen,
    iconSize: 22,
    comingSoon: true,
  },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Hero />
      <main className="flex-1">
        <section id="tools" className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
          <div className="mb-5">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Available Tools
            </h2>
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
