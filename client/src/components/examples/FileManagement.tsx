import FileManagement from "../../pages/FileManagement";
import { ThemeProvider } from "../ThemeProvider";

export default function FileManagementExample() {
  return (
    <ThemeProvider>
      <FileManagement />
    </ThemeProvider>
  );
}
