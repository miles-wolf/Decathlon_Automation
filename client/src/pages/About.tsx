import { ArrowLeft, Mail, Calendar, Code2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function About() {
  const lastUpdated = "January 2026";
  const version = "1.0.0";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                About
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Learn more about Camp Director Tools
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Decathlon Sports Camp Director Tools</CardTitle>
              <CardDescription>
                Streamlined tools for managing camp operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Camp Director Tools is an internal administrative application designed to help 
                Decathlon Sports Camp directors manage staff job assignments efficiently. The app 
                provides modular utilities for handling lunchtime and AM/PM shift assignments, 
                scheduling, and staff management through a clean, intuitive interface.
              </p>
              <p className="text-muted-foreground">
                Built to simplify the complexities of camp operations, this tool allows directors 
                to focus less on paperwork and more on having fun with the kids.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Updated</p>
                    <p className="font-medium" data-testid="text-last-updated">{lastUpdated}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Code2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Version</p>
                    <p className="font-medium" data-testid="text-version">{version}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Contact</p>
                    <a 
                      href="mailto:milesltwolf@gmail.com" 
                      className="font-medium text-primary hover:underline"
                      data-testid="link-contact-email"
                    >
                      milesltwolf@gmail.com
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Credits</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Built by <span className="font-semibold text-foreground">Project Distillation</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
