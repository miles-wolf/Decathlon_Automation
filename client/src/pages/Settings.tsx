import { ArrowLeft, Sun, Moon, Bell, Database, RotateCcw, Users, Check } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/ThemeProvider";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Session = {
  session_id: number;
  session_name: string;
};

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { settings, updateSettings, resetSettings, clearCache } = useSettings();
  const { toast } = useToast();
  
  // Local state for Enter-to-confirm inputs
  const [weeksInput, setWeeksInput] = useState(settings.defaultNumberOfWeeks.toString());
  const [weeksConfirmed, setWeeksConfirmed] = useState(true);
  const [emailInput, setEmailInput] = useState(settings.notificationEmail);
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  
  // Sync local state when settings change externally
  useEffect(() => {
    setWeeksInput(settings.defaultNumberOfWeeks.toString());
    setWeeksConfirmed(true);
  }, [settings.defaultNumberOfWeeks]);
  
  useEffect(() => {
    setEmailInput(settings.notificationEmail);
    setEmailConfirmed(true);
  }, [settings.notificationEmail]);

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/external-db/sessions"],
  });
  
  const handleWeeksKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const num = parseInt(weeksInput);
      if (num >= 1 && num <= 10) {
        updateSettings({ defaultNumberOfWeeks: num });
        setWeeksConfirmed(true);
        toast({
          title: "Default weeks updated",
          description: `Set to ${num} week${num > 1 ? "s" : ""}`,
        });
      }
    }
  };
  
  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      updateSettings({ notificationEmail: emailInput });
      setEmailConfirmed(true);
      toast({
        title: "Email updated",
        description: emailInput ? `Notifications will be sent to ${emailInput}` : "Email cleared",
      });
    }
  };

  const formatSessionDisplay = (sessionId: number) => {
    if (sessionId === 1012) return "Session 1 - 2025";
    if (sessionId === 1015) return "Session 2 - 2025";
    return `Session ${sessionId}`;
  };

  const handleClearCache = () => {
    clearCache();
    toast({
      title: "Cache Cleared",
      description: "Configuration data has been cleared successfully.",
    });
  };

  const handleResetSettings = () => {
    resetSettings();
    toast({
      title: "Settings Reset",
      description: "All settings have been restored to defaults.",
    });
  };

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
                Settings
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure your preferences
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                Appearance
              </CardTitle>
              <CardDescription>
                Customize how the app looks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="theme-toggle">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Switch between light and dark themes
                  </p>
                </div>
                <Switch
                  id="theme-toggle"
                  checked={theme === "dark"}
                  onCheckedChange={toggleTheme}
                  data-testid="switch-theme"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Defaults
              </CardTitle>
              <CardDescription>
                Set default values for the assignment tools
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="default-session">Default Session</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically select this session when opening tools
                  </p>
                </div>
                <Select
                  value={settings.defaultSessionId?.toString() || "none"}
                  onValueChange={(value) => 
                    updateSettings({ defaultSessionId: value === "none" ? null : parseInt(value) })
                  }
                >
                  <SelectTrigger className="w-48" data-testid="select-default-session">
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default</SelectItem>
                    {sessions.map((session) => (
                      <SelectItem key={session.session_id} value={session.session_id.toString()}>
                        {formatSessionDisplay(session.session_id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="default-weeks">Default Number of Weeks</Label>
                  <p className="text-sm text-muted-foreground">
                    Press Enter to save
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="default-weeks"
                    type="number"
                    min={1}
                    max={10}
                    value={weeksInput}
                    onChange={(e) => {
                      setWeeksInput(e.target.value);
                      setWeeksConfirmed(false);
                    }}
                    onKeyDown={handleWeeksKeyDown}
                    className="w-20 text-center"
                    data-testid="input-default-weeks"
                  />
                  {weeksConfirmed && (
                    <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
                      <Check className="h-3 w-3" />
                      Set
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                Configure email alerts for assignments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications-toggle">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts when assignments are generated
                  </p>
                </div>
                <Switch
                  id="notifications-toggle"
                  checked={settings.notificationsEnabled}
                  onCheckedChange={(checked) => updateSettings({ notificationsEnabled: checked })}
                  data-testid="switch-notifications"
                />
              </div>

              {settings.notificationsEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notification-email">Notification Email</Label>
                    <span className="text-xs text-muted-foreground">Press Enter to save</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="notification-email"
                      type="email"
                      placeholder="your@email.com"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setEmailConfirmed(false);
                      }}
                      onKeyDown={handleEmailKeyDown}
                      className="flex-1"
                      data-testid="input-notification-email"
                    />
                    {emailConfirmed && emailInput && (
                      <Badge variant="outline" className="text-green-600 border-green-600 gap-1 shrink-0">
                        <Check className="h-3 w-3" />
                        Set
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Management
              </CardTitle>
              <CardDescription>
                Manage cached data and reset settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Clear Cached Configurations</Label>
                  <p className="text-sm text-muted-foreground">
                    Remove saved job assignment configurations
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" data-testid="button-clear-cache">
                      <Database className="h-4 w-4 mr-2" />
                      Clear Cache
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear cached data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all saved job assignment configurations. You will need to 
                        reconfigure your settings in the Lunchtime and AM/PM Jobs tools.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearCache} data-testid="button-confirm-clear">
                        Clear Cache
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Reset All Settings</Label>
                  <p className="text-sm text-muted-foreground">
                    Restore all settings to their default values
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" data-testid="button-reset-settings">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will restore all settings to their default values. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetSettings} data-testid="button-confirm-reset">
                        Reset Settings
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
