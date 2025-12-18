import { ArrowLeft, Play, Download, Users, Calendar, ExternalLink, Clock, Plus, X, Settings, UserMinus, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogViewer, useLogStream } from "@/components/LogViewer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, BarChart3, ScrollText, FileText } from "lucide-react";

interface EligibleStaff {
  staff_name: string;
  session_id: number;
  staff_id: number;
  role_id: number;
  role_name: string;
  group_id: number;
}

interface ExternalSession {
  session_id: number;
}

interface AMPMJob {
  job_id: number;
  job_code: string;
  job_name: string;
  min_staff_assigned: number | null;
  normal_staff_assigned: number | null;
  max_staff_assigned: number | null;
  job_description: string | null;
  priority: number | null;
}

interface AssignmentResult {
  job_id: number;
  job_name: string;
  job_code: string;
  job_description: string;
  staff_id: number;
  staff_name: string;
}

interface JobAssignment {
  jobId: number;
  staffIds: number[];
}

interface CustomStaff {
  staff_id: number;
  name: string;
  gender: string;
  custom_job_assignment: number | null;
}

export default function AMPMJobs() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [hardcodedAssignments, setHardcodedAssignments] = useState<JobAssignment[]>([]);
  const [customAssignments, setCustomAssignments] = useState<JobAssignment[]>([]);
  const [staffToRemove, setStaffToRemove] = useState<number[]>([]);
  const [staffToAdd, setStaffToAdd] = useState<CustomStaff[]>([]);
  const [assignmentResults, setAssignmentResults] = useState<AssignmentResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputTab, setOutputTab] = useState<string>("summary");
  const [configOpen, setConfigOpen] = useState(true);
  const [staffCounter, setStaffCounter] = useState(9900);
  const { toast } = useToast();
  const logStream = useLogStream();

  // Fetch external sessions
  const { data: externalSessions = [], isLoading: sessionsLoading } = useQuery<ExternalSession[]>({
    queryKey: ["/api/external-db/sessions"],
  });

  // Fetch eligible staff when session is selected
  const { data: eligibleStaff = [], isLoading: staffLoading } = useQuery<EligibleStaff[]>({
    queryKey: ["/api/external-db/eligible-staff", selectedSessionId],
    enabled: !!selectedSessionId,
  });

  // Fetch AM/PM jobs from external database
  const { data: ampmJobs = [], isLoading: jobsLoading } = useQuery<AMPMJob[]>({
    queryKey: ["/api/external-db/ampm-jobs"],
  });

  // Fetch hardcoded job IDs from config for the selected session
  const { data: hardcodedJobConfig } = useQuery<{ hardcodedJobIds: number[] }>({
    queryKey: ["/api/config/ampm-jobs/hardcoded", selectedSessionId],
    enabled: !!selectedSessionId,
  });

  // Get the list of hardcoded job IDs from config
  const hardcodedJobIds = useMemo(() => {
    return hardcodedJobConfig?.hardcodedJobIds || [];
  }, [hardcodedJobConfig]);

  // Staff options for combobox
  const staffOptions = useMemo(() => {
    return eligibleStaff.map((s) => ({
      value: s.staff_id.toString(),
      label: `${s.staff_name} (Group ${s.group_id})`,
    }));
  }, [eligibleStaff]);

  // Job options for combobox (all jobs - for custom assignments)
  const jobOptions = useMemo(() => {
    return ampmJobs.map((j) => ({
      value: j.job_id.toString(),
      label: `${j.job_name} (${j.job_code})`,
    }));
  }, [ampmJobs]);

  // Hardcoded job options - only jobs that are in the config's hardcoded list
  const hardcodedJobOptions = useMemo(() => {
    if (hardcodedJobIds.length === 0) return [];
    return ampmJobs
      .filter((j) => hardcodedJobIds.includes(j.job_id))
      .map((j) => ({
        value: j.job_id.toString(),
        label: `${j.job_name} (${j.job_code})`,
      }));
  }, [ampmJobs, hardcodedJobIds]);

  // Helper to get staff name by ID
  const getStaffName = (staffId: number) => {
    const staff = eligibleStaff.find(s => s.staff_id === staffId);
    return staff?.staff_name || `Staff ${staffId}`;
  };

  // Helper to get job name by ID
  const getJobName = (jobId: number) => {
    const job = ampmJobs.find(j => j.job_id === jobId);
    return job ? `${job.job_name} (${job.job_code})` : `Job ${jobId}`;
  };

  const formatSessionDisplay = (sessionId: number) => {
    if (sessionId === 1012) return "Session 1 - 2025";
    if (sessionId === 1015) return "Session 2 - 2025";
    return `Session ${sessionId}`;
  };

  // Add a new hardcoded assignment
  const handleAddHardcodedAssignment = (jobId: string) => {
    const id = parseInt(jobId);
    if (hardcodedAssignments.some(a => a.jobId === id)) {
      toast({
        title: "Already Added",
        description: "This job already has a hardcoded assignment entry",
        variant: "destructive",
      });
      return;
    }
    setHardcodedAssignments([...hardcodedAssignments, { jobId: id, staffIds: [] }]);
  };

  // Remove a hardcoded assignment
  const handleRemoveHardcodedAssignment = (jobId: number) => {
    setHardcodedAssignments(hardcodedAssignments.filter(a => a.jobId !== jobId));
  };

  // Add staff to a hardcoded assignment
  const handleAddStaffToHardcoded = (jobId: number, staffId: string) => {
    const id = parseInt(staffId);
    setHardcodedAssignments(hardcodedAssignments.map(a => {
      if (a.jobId === jobId) {
        if (a.staffIds.includes(id)) return a;
        return { ...a, staffIds: [...a.staffIds, id] };
      }
      return a;
    }));
  };

  // Remove staff from a hardcoded assignment
  const handleRemoveStaffFromHardcoded = (jobId: number, staffId: number) => {
    setHardcodedAssignments(hardcodedAssignments.map(a => {
      if (a.jobId === jobId) {
        return { ...a, staffIds: a.staffIds.filter(id => id !== staffId) };
      }
      return a;
    }));
  };

  // Add a new custom assignment
  const handleAddCustomAssignment = (jobId: string) => {
    const id = parseInt(jobId);
    if (customAssignments.some(a => a.jobId === id)) {
      toast({
        title: "Already Added",
        description: "This job already has a custom assignment entry",
        variant: "destructive",
      });
      return;
    }
    setCustomAssignments([...customAssignments, { jobId: id, staffIds: [] }]);
  };

  // Remove a custom assignment
  const handleRemoveCustomAssignment = (jobId: number) => {
    setCustomAssignments(customAssignments.filter(a => a.jobId !== jobId));
  };

  // Add staff to a custom assignment
  const handleAddStaffToCustom = (jobId: number, staffId: string) => {
    const id = parseInt(staffId);
    setCustomAssignments(customAssignments.map(a => {
      if (a.jobId === jobId) {
        if (a.staffIds.includes(id)) return a;
        return { ...a, staffIds: [...a.staffIds, id] };
      }
      return a;
    }));
  };

  // Remove staff from a custom assignment
  const handleRemoveStaffFromCustom = (jobId: number, staffId: number) => {
    setCustomAssignments(customAssignments.map(a => {
      if (a.jobId === jobId) {
        return { ...a, staffIds: a.staffIds.filter(id => id !== staffId) };
      }
      return a;
    }));
  };

  // Staff to remove handlers
  const handleAddStaffToRemove = (staffId: string) => {
    const id = parseInt(staffId);
    if (!staffToRemove.includes(id)) {
      setStaffToRemove([...staffToRemove, id]);
    }
  };

  const handleRemoveFromRemoveList = (staffId: number) => {
    setStaffToRemove(staffToRemove.filter(id => id !== staffId));
  };

  // Custom staff (staff_to_add) handlers
  const [newCustomStaff, setNewCustomStaff] = useState<{
    name: string;
    gender: string;
    custom_job_assignment: string;
  }>({
    name: "",
    gender: "M",
    custom_job_assignment: "",
  });

  const handleAddCustomStaff = () => {
    if (!newCustomStaff.name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a staff name",
        variant: "destructive",
      });
      return;
    }

    const newStaff: CustomStaff = {
      staff_id: staffCounter,
      name: newCustomStaff.name.trim(),
      gender: newCustomStaff.gender,
      custom_job_assignment: newCustomStaff.custom_job_assignment 
        ? parseInt(newCustomStaff.custom_job_assignment) 
        : null,
    };

    setStaffToAdd([...staffToAdd, newStaff]);
    setStaffCounter(prev => prev + 1);
    setNewCustomStaff({ name: "", gender: "M", custom_job_assignment: "" });
    
    toast({
      title: "Staff Added",
      description: `${newStaff.name} added to custom staff list`,
    });
  };

  const handleRemoveCustomStaff = (staffId: number) => {
    setStaffToAdd(staffToAdd.filter(s => s.staff_id !== staffId));
  };

  // Get filtered staff options (exclude removed staff)
  const filteredStaffOptions = useMemo(() => {
    return staffOptions.filter(s => !staffToRemove.includes(parseInt(s.value)));
  }, [staffOptions, staffToRemove]);

  // Convert assignments to the format expected by the backend (job_id -> [staff_ids])
  const buildAssignmentPayload = (assignments: JobAssignment[]) => {
    const result: Record<string, number[]> = {};
    for (const a of assignments) {
      if (a.staffIds.length > 0) {
        result[a.jobId.toString()] = a.staffIds;
      }
    }
    return result;
  };

  const handleGenerate = async () => {
    if (!selectedSessionId) {
      toast({
        title: "Session Required",
        description: "Please select a session first",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setOutputTab("logs");
    logStream.clearLogs();
    logStream.info("Starting AM/PM job assignment generation");
    logStream.info(`Session: ${formatSessionDisplay(selectedSessionId)}`);

    // Build assignment payloads
    const hardcodedPayload = buildAssignmentPayload(hardcodedAssignments);
    const customPayload = buildAssignmentPayload(customAssignments);

    logStream.info(`Hardcoded assignments: ${Object.keys(hardcodedPayload).length} jobs`);
    logStream.info(`Custom assignments: ${Object.keys(customPayload).length} jobs`);
    logStream.info(`Staff to remove: ${staffToRemove.length}`);
    logStream.info(`Custom staff to add: ${staffToAdd.length}`);

    try {
      logStream.info("Preparing request...");
      logStream.info("Sending request to server...");
      
      const response = await apiRequest("POST", "/api/execute/ampm-jobs", {
        sessionId: selectedSessionId,
        hardcodedJobAssignments: hardcodedPayload,
        customJobAssignments: customPayload,
        staffToRemove: staffToRemove,
        staffToAdd: staffToAdd,
      });

      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        setAssignmentResults(data.results);
        logStream.success(`Generated ${data.results.length} assignments successfully`);
        
        // Log summary by job
        const byJob = data.results.reduce((acc: Record<string, number>, r: AssignmentResult) => {
          acc[r.job_name] = (acc[r.job_name] || 0) + 1;
          return acc;
        }, {});
        Object.entries(byJob).forEach(([job, count]) => {
          logStream.info(`${job}: ${count} staff`);
        });
        
        setOutputTab("summary");
        toast({
          title: "Success",
          description: `Generated ${data.results.length} assignments`,
        });
      } else if (data.success) {
        logStream.success(data.message || "Assignments generated successfully");
        toast({
          title: "Success",
          description: data.message || "Assignments generated successfully",
        });
      }
    } catch (error: any) {
      logStream.error("Generation failed", error.message);
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      logStream.info("Process complete");
    }
  };

  const handleDownloadCSV = () => {
    if (assignmentResults.length === 0) {
      toast({
        title: "No Results",
        description: "No assignments to download",
        variant: "destructive",
      });
      return;
    }

    const headers = ["job_name", "job_code", "staff_name", "staff_id", "job_description"];
    const csvContent = [
      headers.join(","),
      ...assignmentResults.map(row =>
        headers.map(h => {
          const value = row[h as keyof AssignmentResult];
          if (value === null || value === undefined) return "";
          return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ampm_jobs_session_${selectedSessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Assignments CSV downloaded",
    });
  };

  // Group results by job for display
  const resultsByJob = useMemo(() => {
    const grouped: Record<string, AssignmentResult[]> = {};
    for (const r of assignmentResults) {
      const key = r.job_name;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignmentResults]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                AM/PM Job Assigner
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Generate before/after camp job assignments with custom configurations
              </p>
            </div>
            {selectedSessionId && (
              <Badge variant="secondary" className="hidden sm:flex">
                {formatSessionDisplay(selectedSessionId)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
          {/* Session Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Session Selection
              </CardTitle>
              <CardDescription>
                Select a camp session to generate AM/PM job assignments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end flex-wrap">
                <div className="flex-1 min-w-48 space-y-2">
                  <Label htmlFor="session">Session</Label>
                  <Select
                    value={selectedSessionId?.toString() || ""}
                    onValueChange={(value) => setSelectedSessionId(parseInt(value))}
                    disabled={sessionsLoading}
                  >
                    <SelectTrigger id="session" data-testid="select-session">
                      <SelectValue placeholder={sessionsLoading ? "Loading..." : "Select a session"} />
                    </SelectTrigger>
                    <SelectContent>
                      {externalSessions.map((session) => (
                        <SelectItem key={session.session_id} value={session.session_id.toString()}>
                          {formatSessionDisplay(session.session_id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSessionId && (
                  <div className="flex gap-2">
                    <Badge variant="outline" className="py-2">
                      <Users className="h-3 w-3 mr-1" />
                      {staffLoading ? "..." : `${eligibleStaff.length} staff`}
                    </Badge>
                    <Badge variant="outline" className="py-2">
                      <Clock className="h-3 w-3 mr-1" />
                      {jobsLoading ? "..." : `${ampmJobs.length} jobs`}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Configuration Section */}
          {selectedSessionId && (
            <Card>
              <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover-elevate">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        <div>
                          <CardTitle>Job Assignment Configuration</CardTitle>
                          <CardDescription className="mt-1">
                            Configure hardcoded and custom job assignments for this session
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={`h-5 w-5 transition-transform ${configOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-6">
                    {/* Hardcoded Assignments */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium">Hardcoded Job Assignments</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Assign staff to predefined jobs from the config ({hardcodedJobIds.length} jobs available).
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Combobox
                            options={hardcodedJobOptions.filter(j => !hardcodedAssignments.some(a => a.jobId.toString() === j.value))}
                            placeholder="Select a job to add..."
                            onValueChange={handleAddHardcodedAssignment}
                            testId="combobox-add-hardcoded-job"
                          />
                        </div>
                      </div>

                      {hardcodedAssignments.length > 0 && (
                        <div className="space-y-3">
                          {hardcodedAssignments.map((assignment) => (
                            <div key={assignment.jobId} className="border rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{getJobName(assignment.jobId)}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveHardcodedAssignment(assignment.jobId)}
                                  data-testid={`button-remove-hardcoded-${assignment.jobId}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {assignment.staffIds.map((staffId) => (
                                  <Badge key={staffId} variant="secondary" className="flex items-center gap-1">
                                    {getStaffName(staffId)}
                                    <button
                                      onClick={() => handleRemoveStaffFromHardcoded(assignment.jobId, staffId)}
                                      className="ml-1 hover:text-destructive"
                                      data-testid={`button-remove-hardcoded-staff-${assignment.jobId}-${staffId}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                              <Combobox
                                options={filteredStaffOptions.filter(s => !assignment.staffIds.includes(parseInt(s.value)))}
                                placeholder="Add staff..."
                                onValueChange={(value: string) => handleAddStaffToHardcoded(assignment.jobId, value)}
                                testId={`combobox-add-hardcoded-staff-${assignment.jobId}`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Custom Assignments */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium">Custom Job Assignments</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Assign staff to any additional jobs beyond the predefined list.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Combobox
                            options={jobOptions.filter(j => !customAssignments.some(a => a.jobId.toString() === j.value))}
                            placeholder="Select a job to add..."
                            onValueChange={handleAddCustomAssignment}
                            testId="combobox-add-custom-job"
                          />
                        </div>
                      </div>

                      {customAssignments.length > 0 && (
                        <div className="space-y-3">
                          {customAssignments.map((assignment) => (
                            <div key={assignment.jobId} className="border rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{getJobName(assignment.jobId)}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveCustomAssignment(assignment.jobId)}
                                  data-testid={`button-remove-custom-${assignment.jobId}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {assignment.staffIds.map((staffId) => (
                                  <Badge key={staffId} variant="secondary" className="flex items-center gap-1">
                                    {getStaffName(staffId)}
                                    <button
                                      onClick={() => handleRemoveStaffFromCustom(assignment.jobId, staffId)}
                                      className="ml-1 hover:text-destructive"
                                      data-testid={`button-remove-custom-staff-${assignment.jobId}-${staffId}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                              <Combobox
                                options={filteredStaffOptions.filter(s => !assignment.staffIds.includes(parseInt(s.value)))}
                                placeholder="Add staff..."
                                onValueChange={(value: string) => handleAddStaffToCustom(assignment.jobId, value)}
                                testId={`combobox-add-custom-staff-${assignment.jobId}`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Staff to Remove */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <UserMinus className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <h3 className="text-sm font-medium">Staff to Exclude</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Exclude staff from this session's assignments
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Combobox
                            options={staffOptions.filter(s => !staffToRemove.includes(parseInt(s.value)))}
                            placeholder="Select staff to exclude..."
                            onValueChange={handleAddStaffToRemove}
                            testId="combobox-staff-to-remove"
                          />
                        </div>
                      </div>

                      {staffToRemove.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {staffToRemove.map((staffId) => (
                            <Badge key={staffId} variant="secondary" className="flex items-center gap-1">
                              {getStaffName(staffId)}
                              <button
                                onClick={() => handleRemoveFromRemoveList(staffId)}
                                className="ml-1 hover:text-destructive"
                                data-testid={`button-unexclude-staff-${staffId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Custom Staff to Add */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <h3 className="text-sm font-medium">Add Custom Staff</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Add staff members not in the database with optional job assignment
                          </p>
                        </div>
                      </div>
                      
                      <div className="border rounded-lg p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="custom-staff-name" className="text-xs">Name</Label>
                            <Input
                              id="custom-staff-name"
                              placeholder="Staff name"
                              value={newCustomStaff.name}
                              onChange={(e) => setNewCustomStaff(prev => ({ ...prev, name: e.target.value }))}
                              data-testid="input-custom-staff-name"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="custom-staff-gender" className="text-xs">Gender</Label>
                            <Select
                              value={newCustomStaff.gender}
                              onValueChange={(value) => setNewCustomStaff(prev => ({ ...prev, gender: value }))}
                            >
                              <SelectTrigger id="custom-staff-gender" data-testid="select-custom-staff-gender">
                                <SelectValue placeholder="Gender" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="M">Male</SelectItem>
                                <SelectItem value="F">Female</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Job Assignment (optional)</Label>
                            <Combobox
                              options={jobOptions}
                              placeholder="Assign to job..."
                              value={newCustomStaff.custom_job_assignment}
                              onValueChange={(value: string) => setNewCustomStaff(prev => ({ ...prev, custom_job_assignment: value }))}
                              testId="combobox-custom-staff-job"
                            />
                          </div>
                        </div>
                        <Button 
                          onClick={handleAddCustomStaff} 
                          size="sm"
                          data-testid="button-add-custom-staff"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Staff
                        </Button>
                      </div>

                      {staffToAdd.length > 0 && (
                        <div className="space-y-2">
                          {staffToAdd.map((staff) => (
                            <div key={staff.staff_id} className="flex items-center justify-between border rounded-lg p-2">
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-sm">{staff.name}</span>
                                <Badge variant="outline">{staff.gender}</Badge>
                                {staff.custom_job_assignment && (
                                  <Badge variant="secondary">
                                    {getJobName(staff.custom_job_assignment)}
                                  </Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveCustomStaff(staff.staff_id)}
                                data-testid={`button-remove-custom-staff-${staff.staff_id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Config Summary */}
                    <div className="pt-4 border-t">
                      <div className="flex gap-4 flex-wrap text-sm text-muted-foreground">
                        <span>Hardcoded: {hardcodedAssignments.filter(a => a.staffIds.length > 0).length} jobs</span>
                        <span>Custom: {customAssignments.filter(a => a.staffIds.length > 0).length} jobs</span>
                        <span>Excluded: {staffToRemove.length} staff</span>
                        <span>Added: {staffToAdd.length} staff</span>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}

          {/* Actions */}
          {selectedSessionId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Generate Assignments
                </CardTitle>
                <CardDescription>
                  Run the assignment algorithm for before/after camp jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    data-testid="button-generate"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {isGenerating ? "Generating..." : "Generate Assignments"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadCSV}
                    disabled={assignmentResults.length === 0}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const url = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEETS_ID || "1WFWFo55mfQlyto-SBnAcFOqUIt_kyvaHdpcjamBzXb4"}/edit`;
                      window.open(url, "_blank");
                    }}
                    data-testid="button-view-sheets"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Google Sheet
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Output Section with Tabs */}
          {selectedSessionId && (assignmentResults.length > 0 || logStream.logs.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Output</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={outputTab} onValueChange={setOutputTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="summary" data-testid="tab-summary">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Summary
                    </TabsTrigger>
                    <TabsTrigger value="details" data-testid="tab-details">
                      <FileText className="h-4 w-4 mr-2" />
                      Details
                    </TabsTrigger>
                    <TabsTrigger value="logs" data-testid="tab-logs">
                      <ScrollText className="h-4 w-4 mr-2" />
                      Logs
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="summary">
                    {assignmentResults.length > 0 ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {resultsByJob.map(([jobName, results]) => (
                            <div key={jobName} className="border rounded-lg p-3">
                              <div className="text-sm font-medium truncate" title={jobName}>
                                {jobName}
                              </div>
                              <div className="text-2xl font-bold mt-1">{results.length}</div>
                              <div className="text-xs text-muted-foreground">staff assigned</div>
                            </div>
                          ))}
                        </div>
                        <div className="text-sm text-muted-foreground pt-2 border-t">
                          Total: {assignmentResults.length} assignments across {resultsByJob.length} jobs
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No assignments generated yet. Click "Generate Assignments" to start.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="details">
                    {assignmentResults.length > 0 ? (
                      <div className="max-h-96 overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Job</TableHead>
                              <TableHead>Code</TableHead>
                              <TableHead>Staff</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {assignmentResults.map((result, idx) => (
                              <TableRow key={idx} data-testid={`row-assignment-${idx}`}>
                                <TableCell className="font-medium">{result.job_name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{result.job_code}</Badge>
                                </TableCell>
                                <TableCell>{result.staff_name}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No assignments to display.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="logs">
                    <LogViewer logs={logStream.logs} maxHeight="400px" />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Available Jobs Reference */}
          {selectedSessionId && ampmJobs.length > 0 && (
            <Card>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover-elevate">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Available AM/PM Jobs Reference</CardTitle>
                        <CardDescription>
                          View all available jobs and their staffing requirements
                        </CardDescription>
                      </div>
                      <ChevronDown className="h-5 w-5" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="max-h-64 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Job ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Min</TableHead>
                            <TableHead>Normal</TableHead>
                            <TableHead>Max</TableHead>
                            <TableHead>Priority</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ampmJobs.map((job) => (
                            <TableRow key={job.job_id} data-testid={`row-job-${job.job_id}`}>
                              <TableCell>{job.job_id}</TableCell>
                              <TableCell className="font-medium">{job.job_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{job.job_code}</Badge>
                              </TableCell>
                              <TableCell>{job.min_staff_assigned ?? "-"}</TableCell>
                              <TableCell>{job.normal_staff_assigned ?? "-"}</TableCell>
                              <TableCell>{job.max_staff_assigned ?? "-"}</TableCell>
                              <TableCell>{job.priority ?? "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
