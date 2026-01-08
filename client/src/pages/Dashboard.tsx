import { useEffect } from "react";
import { Briefcase, Clock, Upload, Calendar, Trophy, BookOpen } from "lucide-react";
import { Hero } from "@/components/Hero";
import { ToolCard } from "@/components/ToolCard";
import { apiRequest } from "@/lib/queryClient";

const tools = [
  {
    id: "lunchtime-jobs",
    title: "Lunchtime Jobs Assigner",
    description:
      "Quickly assign and balance lunchtime jobs across staff for the session",
    icon: Briefcase,
    iconSize: 24,
  },
  {
    id: "am-pm-jobs",
    title: "AM/PM Jobs Assigner",
    description:
      "Quickly assign AM/PM jobs across staff for the session",
    icon: Clock,
    iconSize: 24,
  },
  {
    id: "schedule-builder",
    title: "Schedule Builder",
    description:
      "Create the daily schedule for the entire session or for special Fridays",
    icon: Calendar,
    iconSize: 22,
    comingSoon: true,
  },
  {
    id: "tournament-builder",
    title: "Tournament Builder",
    description:
      "Create fair teams and brackets for soccer, football, basketball tournaments and more",
    icon: Trophy,
    iconSize: 22,
    comingSoon: true,
  },
  {
    id: "digitized-binder",
    title: "Digitized Binder",
    description:
      "Build and edit a digitized binder for staff to easily find whatever they're looking for at a moment's notice",
    icon: BookOpen,
    iconSize: 22,
    comingSoon: true,
  },
  {
    id: "upload-lists",
    title: "File Manager",
    description:
      "Upload documentation such as staff lists, lunchtime and ampm job lists and other specifications",
    icon: Upload,
    iconSize: 20,
    comingSoon: true,
  },
];

export default function Dashboard() {
  // Warm up the cache when the dashboard loads
  // This pre-fetches sessions, lunch jobs, and AM/PM jobs data
  // so it's ready when users open the tools
  useEffect(() => {
    const warmUpCache = async () => {
      try {
        console.log("Warming up cache...");
        await apiRequest("POST", "/api/external-db/warm-cache");
        console.log("Cache warm-up complete");
      } catch (error) {
        console.error("Cache warm-up failed:", error);
        // Silently fail - the tools will still work, just with initial load time
      }
    };
    
    warmUpCache();
  }, []);
  
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
