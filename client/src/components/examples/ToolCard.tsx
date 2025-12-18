import { ToolCard } from "../ToolCard";
import { Briefcase } from "lucide-react";

export default function ToolCardExample() {
  return (
    <div className="p-8 max-w-md">
      <ToolCard
        id="example-tool"
        icon={Briefcase}
        title="Example Tool"
        description="This is an example tool card showing how it looks."
      />
    </div>
  );
}
