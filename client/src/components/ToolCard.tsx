import { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

type ToolCardProps = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  comingSoon?: boolean;
};

export function ToolCard({ id, icon: Icon, title, description, comingSoon }: ToolCardProps) {
  if (comingSoon) {
    return (
      <div
        className="block rounded-2xl border bg-card p-5 opacity-60 cursor-not-allowed"
        data-testid={`card-tool-${id}`}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl grid place-content-center bg-[#6bcff6] dark:bg-[#1e4a5a]">
            <Icon className="h-6 w-6 text-[#1a5568] dark:text-[#6bcff6]" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold tracking-tight">{title}</h3>
              <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/${id}`}
      className="group block rounded-2xl border bg-card p-5 hover:shadow-md transition-shadow hover-elevate"
      data-testid={`card-tool-${id}`}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-content-center bg-[#6bcff6] dark:bg-[#1e4a5a]">
          <Icon className="h-6 w-6 text-[#1a5568] dark:text-[#6bcff6]" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      <div className="mt-4">
        <span className="inline-flex items-center text-sm font-medium text-primary group-hover:translate-x-0.5 transition-transform">
          Open <span className="ml-1">→</span>
        </span>
      </div>
    </Link>
  );
}
