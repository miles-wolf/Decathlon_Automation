import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SettingsProvider } from "@/hooks/use-settings";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Dashboard from "@/pages/Dashboard";
import LunchtimeJobs from "@/pages/LunchtimeJobs";
import AMPMJobs from "@/pages/AMPMJobs";
import UploadLists from "@/pages/UploadLists";
import History from "@/pages/History";
import About from "@/pages/About";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

// Scroll to top on route change (unless navigating to a hash anchor)
function ScrollToTop() {
  const [location] = useLocation();
  const prevLocation = useRef(location);

  useEffect(() => {
    // Only scroll to top if the path changed (not just the hash)
    const currentPath = location.split("#")[0];
    const prevPath = prevLocation.current.split("#")[0];
    
    if (currentPath !== prevPath && !window.location.hash) {
      window.scrollTo(0, 0);
    }
    
    prevLocation.current = location;
  }, [location]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/upload-lists" component={UploadLists} />
      <Route path="/lunchtime-jobs" component={LunchtimeJobs} />
      <Route path="/am-pm-jobs" component={AMPMJobs} />
      <Route path="/history" component={History} />
      <Route path="/about" component={About} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <SettingsProvider>
            <ScrollToTop />
            <div className="min-h-screen bg-background flex flex-col">
              <Navbar />
              <div className="flex-1">
                <Router />
              </div>
              <Footer />
            </div>
            <Toaster />
          </SettingsProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
