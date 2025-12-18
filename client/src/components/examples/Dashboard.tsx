import Dashboard from "../../pages/Dashboard";
import { ThemeProvider } from "../ThemeProvider";

export default function DashboardExample() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  );
}
