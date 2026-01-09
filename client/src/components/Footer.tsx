import { useLocation } from "wouter";

export function Footer() {
  const [location, setLocation] = useLocation();

  const handleNavClick = (hash: string) => {
    const isOnAboutPage = location.startsWith("/about");
    
    if (isOnAboutPage) {
      // Already on about page, just scroll to section
      const element = document.querySelector(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      // Update URL hash without navigation
      window.history.pushState(null, "", `/about${hash}`);
    } else {
      // Navigate to about page with hash
      setLocation(`/about${hash}`);
    }
  };

  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Decathlon Sports Camp Director Tools</p>
          <div className="flex items-center gap-6">
            <button
              onClick={() => handleNavClick("#privacy")}
              className="hover:text-foreground transition-colors hover-elevate active-elevate-2 px-2 py-1 rounded-md"
              data-testid="link-privacy"
            >
              Privacy
            </button>
            <button
              onClick={() => handleNavClick("#terms")}
              className="hover:text-foreground transition-colors hover-elevate active-elevate-2 px-2 py-1 rounded-md"
              data-testid="link-terms"
            >
              Terms
            </button>
            <button
              onClick={() => handleNavClick("#support")}
              className="hover:text-foreground transition-colors hover-elevate active-elevate-2 px-2 py-1 rounded-md"
              data-testid="link-support"
            >
              Support
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
