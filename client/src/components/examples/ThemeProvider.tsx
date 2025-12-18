import { ThemeProvider, useTheme } from "../ThemeProvider";
import { Button } from "@/components/ui/button";

function ThemeDemo() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="p-8 space-y-4">
      <div className="text-xl font-semibold">
        Current Theme: {theme === "dark" ? "Dark" : "Light"}
      </div>
      <Button onClick={toggleTheme}>Toggle Theme</Button>
    </div>
  );
}

export default function ThemeProviderExample() {
  return (
    <ThemeProvider>
      <ThemeDemo />
    </ThemeProvider>
  );
}
