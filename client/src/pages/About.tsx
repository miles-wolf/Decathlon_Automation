import { ArrowLeft, Mail, Calendar, Code2, Shield, FileText, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect } from "react";

export default function About() {
  const lastUpdated = "January 2026";
  const version = "1.0.0";

  // Scroll to hash on page load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const element = document.querySelector(hash);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, []);

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

          {/* Privacy Section */}
          <Card id="privacy" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Privacy
              </CardTitle>
              <CardDescription>How we handle your data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Data Collection</h4>
                <p className="text-muted-foreground text-sm">
                  Camp Director Tools collects only superficial staff data necessary for scheduling operations, including:
                </p>
                <ul className="list-disc list-inside text-muted-foreground text-sm mt-2 space-y-1">
                  <li>Staff names</li>
                  <li>Job assignments</li>
                  <li>Work schedules</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Data Usage</h4>
                <p className="text-muted-foreground text-sm">
                  Your data is used solely for managing camp operations, generating job assignments, 
                  and syncing schedules to Google Sheets. Data is not shared with third parties 
                  outside of the tools required for camp administration.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Internal Use Only</h4>
                <p className="text-muted-foreground text-sm">
                  This is an internal administrative tool. All data remains within Decathlon Sports Camp 
                  systems and is accessible only to authorized camp directors.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Terms Section */}
          <Card id="terms" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Terms of Use
              </CardTitle>
              <CardDescription>Guidelines for using this tool</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Authorized Use</h4>
                <p className="text-muted-foreground text-sm">
                  Camp Director Tools is intended for use by authorized Decathlon Sports Camp staff only. 
                  Access credentials should not be shared with unauthorized individuals.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Data Accuracy</h4>
                <p className="text-muted-foreground text-sm">
                  Users are responsible for verifying the accuracy of job assignments before publishing 
                  schedules to Google Sheets. Always review generated assignments before finalizing.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">System Availability</h4>
                <p className="text-muted-foreground text-sm">
                  While we strive to maintain system availability, the tool may occasionally be 
                  unavailable for maintenance or updates. Critical scheduling should be completed 
                  with adequate time before deadlines.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Support Section */}
          <Card id="support" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Support
              </CardTitle>
              <CardDescription>Get help when you need it</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Contact</h4>
                <p className="text-muted-foreground text-sm">
                  For questions, issues, or feature requests, please reach out via email:
                </p>
                <a 
                  href="mailto:milesltwolf@gmail.com" 
                  className="inline-flex items-center gap-2 mt-2 text-primary hover:underline"
                  data-testid="link-support-email"
                >
                  <Mail className="h-4 w-4" />
                  milesltwolf@gmail.com
                </a>
              </div>
              <div>
                <h4 className="font-medium mb-2">Reporting Issues</h4>
                <p className="text-muted-foreground text-sm">
                  When reporting a problem, please include:
                </p>
                <ul className="list-disc list-inside text-muted-foreground text-sm mt-2 space-y-1">
                  <li>A description of what you were trying to do</li>
                  <li>What happened instead</li>
                  <li>The session ID and week number (if applicable)</li>
                  <li>Any error messages displayed</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Response Time</h4>
                <p className="text-muted-foreground text-sm">
                  We aim to respond to all inquiries within 1-2 business days. For urgent issues 
                  during camp sessions, please indicate "URGENT" in your email subject line.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
