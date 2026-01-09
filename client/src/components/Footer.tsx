import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Decathlon Sports Camp Director Tools</p>
          <div className="flex items-center gap-6">
            <Link
              href="/about#privacy"
              className="hover:text-foreground transition-colors hover-elevate active-elevate-2 px-2 py-1 rounded-md"
              data-testid="link-privacy"
            >
              Privacy
            </Link>
            <Link
              href="/about#terms"
              className="hover:text-foreground transition-colors hover-elevate active-elevate-2 px-2 py-1 rounded-md"
              data-testid="link-terms"
            >
              Terms
            </Link>
            <Link
              href="/about#support"
              className="hover:text-foreground transition-colors hover-elevate active-elevate-2 px-2 py-1 rounded-md"
              data-testid="link-support"
            >
              Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
