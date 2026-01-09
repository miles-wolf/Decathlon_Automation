import { ArrowLeft, Play, Download, Upload, Save, FileSpreadsheet, Plus, X, ExternalLink, Copy, Users, Calendar, Settings, FileText, BarChart3, ScrollText, ChevronDown, RefreshCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo, useEffect, useRef, type ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface LunchJob {
  job_id: number;
  job_code: string;
  job_name: string;
  min_staff_assigned: number | null;
  normal_staff_assigned: number | null;
  max_staff_assigned: number | null;
  job_description: string | null;
  priority: number | null;
}

interface CustomStaff {
  staff_id: number;
  staff_name: string;
  group_id: number;
  job_type: number; // 1005 = Counselor, 1006 = Junior Counselor
  actual_assignment?: string;
}

const JOB_TYPES = [
  { value: 1005, label: "Counselor" },
  { value: 1006, label: "Junior Counselor" },
];

interface PatternBasedJob {
  staffId: number;
  jobIds: number[];
}

interface CustomJobAssignment {
  staffId: number;
  jobId: number;
  day?: string;
}

interface WeekConfig {
  weekNumber: number;
  patternBasedJobs: PatternBasedJob[];
  staffGameDays: string[];
  tieDyeDays: string[];
  tieDyeStaff: number[];
  staffToRemove: number[];
  staffToAdd: CustomStaff[];
  artsAndCraftsStaff: number[];
  cardTradingStaff: number[];
  customJobAssignments: {
    allDays: CustomJobAssignment[];
    specificDays: CustomJobAssignment[];
  };
  debug: boolean;
  verbose: boolean;
  useSessionDefaults: boolean;
}

interface SessionDefaults {
  artsAndCraftsStaff: number[];
  cardTradingStaff: number[];
  customJobAssignments: {
    allDays: CustomJobAssignment[];
    specificDays: CustomJobAssignment[];
  };
  staffToRemove: number[];
  staffToAdd: CustomStaff[];
}

interface AssignmentResult {
  day: string;
  lunch_job_id: number;
  job_name: string;
  job_code: string;
  staff_id: number;
  staff_name: string;
  week?: number;
}

interface NoWorkingIssue {
  week: number;
  day: string;
  group_id: number;
  issue_type: 'no_working';
}

interface AllWorkingIssue {
  week: number;
  day: string;
  group_id: number;
  assigned: number;
  total: number;
  issue_type: 'all_working';
}

interface GroupCoverageValidation {
  passed: boolean;
  message: string;
  noWorkingIssues: NoWorkingIssue[];
  allWorkingIssues: AllWorkingIssue[];
}

interface ValidationResult {
  groupCoverage: GroupCoverageValidation;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday"];

const createDefaultSessionDefaults = (): SessionDefaults => ({
  artsAndCraftsStaff: [],
  cardTradingStaff: [],
  staffToAdd: [],
  customJobAssignments: {
    allDays: [],
    specificDays: [],
  },
  staffToRemove: [],
});

export default function LunchtimeJobs() {
  const { settings } = useSettings();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [activeWeek, setActiveWeek] = useState(1);
  const [configTab, setConfigTab] = useState<string>("full-session");
  const [sessionDefaults, setSessionDefaults] = useState<SessionDefaults>(createDefaultSessionDefaults());
  const [weekConfigs, setWeekConfigs] = useState<WeekConfig[]>([createDefaultWeekConfig(1)]);
  const [assignmentResults, setAssignmentResults] = useState<AssignmentResult[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputTab, setOutputTab] = useState<string>("summary");
  const [hardcodedOpen, setHardcodedOpen] = useState(true);
  const [weekScheduleOpen, setWeekScheduleOpen] = useState(true);
  const [weekHardcodedOpen, setWeekHardcodedOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [numberOfWeeks, setNumberOfWeeks] = useState(settings.defaultNumberOfWeeks);
  const [weeksInputValue, setWeeksInputValue] = useState(settings.defaultNumberOfWeeks.toString());
  const [targetStaffOpen, setTargetStaffOpen] = useState(false);
  const [variationFilter, setVariationFilter] = useState<'below' | 'all'>('below');
  const [hasAppliedDefaults, setHasAppliedDefaults] = useState(false);
  const { toast } = useToast();
  const logStream = useLogStream();
  
  // Apply default session and weeks from settings on mount
  useEffect(() => {
    if (!hasAppliedDefaults) {
      if (settings.defaultSessionId !== null) {
        setSelectedSessionId(settings.defaultSessionId);
      }
      if (settings.defaultNumberOfWeeks > 1) {
        setNumberOfWeeks(settings.defaultNumberOfWeeks);
        setWeeksInputValue(settings.defaultNumberOfWeeks.toString());
        const newConfigs: WeekConfig[] = [];
        for (let i = 1; i <= settings.defaultNumberOfWeeks; i++) {
          newConfigs.push(createDefaultWeekConfig(i));
        }
        setWeekConfigs(newConfigs);
      }
      setHasAppliedDefaults(true);
    }
  }, [hasAppliedDefaults]);
  
  // Refresh data mutation - clears cache and re-fetches all data
  const refreshDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/external-db/refresh-cache", { refetch: true });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all related queries to force refetch
      queryClient.invalidateQueries({ queryKey: ["/api/external-db/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/external-db/lunch-jobs"] });
      if (selectedSessionId) {
        queryClient.invalidateQueries({ queryKey: ["/api/external-db/eligible-staff", selectedSessionId] });
      }
      toast({
        title: "Data Refreshed",
        description: "Successfully refreshed all data from the database.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh data. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fetch external sessions
  const { data: externalSessions = [], isLoading: sessionsLoading } = useQuery<ExternalSession[]>({
    queryKey: ["/api/external-db/sessions"],
  });

  // Fetch eligible staff when session is selected
  const { data: eligibleStaff = [], isLoading: staffLoading } = useQuery<EligibleStaff[]>({
    queryKey: ["/api/external-db/eligible-staff", selectedSessionId],
    enabled: !!selectedSessionId,
  });

  // Fetch lunch jobs from external database
  const { data: lunchJobs = [], isLoading: jobsLoading } = useQuery<LunchJob[]>({
    queryKey: ["/api/external-db/lunch-jobs"],
  });

  // Create staff options from eligible staff
  const staffOptions = useMemo(() => {
    return eligibleStaff.map((s) => ({
      value: s.staff_id.toString(),
      label: `${s.staff_name} (Group ${s.group_id})`,
    }));
  }, [eligibleStaff]);

  // Create filtered staff options that exclude session-excluded staff from dropdowns
  const filteredStaffOptions = useMemo(() => {
    return staffOptions.filter(s => !sessionDefaults.staffToRemove.includes(parseInt(s.value)));
  }, [staffOptions, sessionDefaults.staffToRemove]);

  // Create job options from lunch jobs
  const jobOptions = useMemo(() => {
    return lunchJobs.map((j) => ({
      value: j.job_id.toString(),
      label: `${j.job_name} (${j.job_code})`,
    }));
  }, [lunchJobs]);

  // Get unique groups from staff
  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(eligibleStaff.map(s => s.group_id))).sort((a, b) => a - b);
    return groups.map(g => ({
      value: g.toString(),
      label: `Group ${g}`,
    }));
  }, [eligibleStaff]);

  // Helper to get job name by ID
  const getJobNameById = (jobId: number) => {
    const job = lunchJobs.find(j => j.job_id === jobId);
    return job?.job_name || `Job ${jobId}`;
  };

  // Helper to get staff group by ID
  const getStaffGroup = (staffId: number) => {
    const staff = eligibleStaff.find(s => s.staff_id === staffId);
    return staff?.group_id ?? null;
  };

  // Compute job-day statistics for summary
  const jobDayStats = useMemo(() => {
    if (assignmentResults.length === 0) return { byJob: {}, sameGroupWarnings: [], deviations: [], staffGameDays: [] };
    
    // Get Staff Game days per week (to exclude from same-group warnings)
    // Use job_code directly from assignment results (more reliable than looking up from lunchJobs)
    const staffGameDays: Array<{ week: number; day: string }> = [];
    for (const r of assignmentResults) {
      if (r.job_code === "SG") {
        const week = r.week || 1;
        if (!staffGameDays.some(sg => sg.week === week && sg.day === r.day)) {
          staffGameDays.push({ week, day: r.day });
        }
      }
    }
    
    // Get number of weeks from results
    const weeks = Array.from(new Set(assignmentResults.map(r => r.week || 1)));
    const numWeeks = weeks.length;
    
    // Group by job, tracking per-week/day counts (exclude Staff Games from summary)
    type JobStats = {
      jobId: number;
      normalStaff: number | null;
      byWeekDay: Record<string, number>; // "week-day" -> count
      byDay: Record<string, number>; // day -> total count across weeks
      avgPerDay: number; // average per single day instance (not combined)
    };
    const byJob: Record<string, JobStats> = {};
    
    for (const r of assignmentResults) {
      // Exclude Staff Games from the summary table using job_code
      if (r.job_code === "SG") continue;
      
      const jobKey = r.job_name;
      if (!byJob[jobKey]) {
        const jobInfo = lunchJobs.find(j => j.job_id === r.lunch_job_id);
        byJob[jobKey] = { 
          jobId: r.lunch_job_id, 
          normalStaff: jobInfo?.normal_staff_assigned ?? null,
          byWeekDay: {}, 
          byDay: {},
          avgPerDay: 0 
        };
      }
      const weekDayKey = `${r.week || 1}-${r.day}`;
      byJob[jobKey].byWeekDay[weekDayKey] = (byJob[jobKey].byWeekDay[weekDayKey] || 0) + 1;
      byJob[jobKey].byDay[r.day] = (byJob[jobKey].byDay[r.day] || 0) + 1;
    }
    
    // Calculate average per single day instance (total / number of week-day occurrences)
    for (const job of Object.values(byJob)) {
      const weekDayValues = Object.values(job.byWeekDay);
      job.avgPerDay = weekDayValues.length > 0 ? weekDayValues.reduce((a, b) => a + b, 0) / weekDayValues.length : 0;
    }
    
    // Collect deviations: any week/day above or below average, or avg vs normal_staff
    type Deviation = {
      jobName: string;
      type: 'week_day_above' | 'week_day_below' | 'avg_above_target' | 'avg_below_target';
      week?: number;
      day?: string;
      count?: number;
      avg?: number;
      target?: number;
    };
    const deviations: Deviation[] = [];
    
    for (const [jobName, stats] of Object.entries(byJob)) {
      // Check each week/day against average
      for (const [weekDayKey, count] of Object.entries(stats.byWeekDay)) {
        const [weekStr, day] = weekDayKey.split('-');
        const week = parseInt(weekStr);
        if (count > stats.avgPerDay + 0.5) {
          deviations.push({ jobName, type: 'week_day_above', week, day, count, avg: stats.avgPerDay });
        } else if (count < stats.avgPerDay - 0.5 && count > 0) {
          deviations.push({ jobName, type: 'week_day_below', week, day, count, avg: stats.avgPerDay });
        }
      }
      
      // Check average against normal_staff_assigned target
      if (stats.normalStaff !== null) {
        if (stats.avgPerDay > stats.normalStaff + 0.5) {
          deviations.push({ jobName, type: 'avg_above_target', avg: stats.avgPerDay, target: stats.normalStaff });
        } else if (stats.avgPerDay < stats.normalStaff - 0.5) {
          deviations.push({ jobName, type: 'avg_below_target', avg: stats.avgPerDay, target: stats.normalStaff });
        }
      }
    }
    
    // Detect same-group working same day (except Staff Games and Staff Game days)
    const sameGroupWarnings: Array<{ week: number; day: string; groupId: number; staffNames: string[] }> = [];
    
    for (const week of weeks) {
      for (const day of DAYS) {
        // Skip Staff Game days entirely
        if (staffGameDays.some(sg => sg.week === week && sg.day === day)) continue;
        
        // Get all staff working this week/day, excluding Staff Games job
        const dayResults = assignmentResults.filter(r => 
          (r.week || 1) === week && r.day === day && r.job_code !== "SG"
        );
        
        // Group by group_id
        const byGroup: Record<number, string[]> = {};
        for (const r of dayResults) {
          const groupId = getStaffGroup(r.staff_id);
          if (groupId !== null) {
            if (!byGroup[groupId]) byGroup[groupId] = [];
            if (!byGroup[groupId].includes(r.staff_name)) {
              byGroup[groupId].push(r.staff_name);
            }
          }
        }
        
        // Find groups where all members are working the same day
        for (const [groupIdStr, staffNames] of Object.entries(byGroup)) {
          const groupId = parseInt(groupIdStr);
          const totalGroupMembers = eligibleStaff.filter(s => s.group_id === groupId).length;
          
          // If all group members (at least 2) are working the same day on non-Staff Games jobs
          if (staffNames.length >= 2 && staffNames.length === totalGroupMembers) {
            sameGroupWarnings.push({ week, day, groupId, staffNames });
          }
        }
      }
    }
    
    return { byJob, sameGroupWarnings, deviations, staffGameDays };
  }, [assignmentResults, eligibleStaff, lunchJobs]);

  function createDefaultWeekConfig(weekNumber: number): WeekConfig {
    return {
      weekNumber,
      patternBasedJobs: [],
      staffGameDays: [],
      tieDyeDays: [],
      tieDyeStaff: [],
      staffToRemove: [],
      staffToAdd: [],
      artsAndCraftsStaff: [],
      cardTradingStaff: [],
      customJobAssignments: {
        allDays: [],
        specificDays: [],
      },
      debug: false,
      verbose: false,
      useSessionDefaults: true,
    };
  }

  // Get job IDs by code
  const getJobIdByCode = (code: string) => {
    const job = lunchJobs.find(j => j.job_code === code);
    return job?.job_id;
  };

  // Arts & Crafts and Card Trading job IDs
  const artsAndCraftsJobId = useMemo(() => getJobIdByCode("A&C"), [lunchJobs]);
  const cardTradingJobId = useMemo(() => getJobIdByCode("CT"), [lunchJobs]);

  // Session defaults handlers
  const handleAddArtsAndCraftsStaff = (staffId: string) => {
    const id = parseInt(staffId);
    if (sessionDefaults.artsAndCraftsStaff.length >= 2) {
      toast({
        title: "Maximum Reached",
        description: "Arts & Crafts can only have 2 staff assigned",
        variant: "destructive",
      });
      return;
    }
    if (!sessionDefaults.artsAndCraftsStaff.includes(id)) {
      setSessionDefaults(prev => ({
        ...prev,
        artsAndCraftsStaff: [...prev.artsAndCraftsStaff, id],
      }));
    }
  };

  const handleRemoveArtsAndCraftsStaff = (staffId: number) => {
    setSessionDefaults(prev => ({
      ...prev,
      artsAndCraftsStaff: prev.artsAndCraftsStaff.filter(id => id !== staffId),
    }));
  };

  const handleAddCardTradingStaff = (staffId: string) => {
    const id = parseInt(staffId);
    if (sessionDefaults.cardTradingStaff.length >= 2) {
      toast({
        title: "Maximum Reached",
        description: "Card Trading can only have 2 staff assigned",
        variant: "destructive",
      });
      return;
    }
    if (!sessionDefaults.cardTradingStaff.includes(id)) {
      setSessionDefaults(prev => ({
        ...prev,
        cardTradingStaff: [...prev.cardTradingStaff, id],
      }));
    }
  };

  const handleRemoveCardTradingStaff = (staffId: number) => {
    setSessionDefaults(prev => ({
      ...prev,
      cardTradingStaff: prev.cardTradingStaff.filter(id => id !== staffId),
    }));
  };

  // Session-level custom job assignment
  const [newSessionAssignment, setNewSessionAssignment] = useState<{ staffId: string; jobId: string }>({
    staffId: "",
    jobId: "",
  });

  const handleAddSessionCustomAssignment = () => {
    if (!newSessionAssignment.staffId || !newSessionAssignment.jobId) {
      toast({
        title: "Missing Selection",
        description: "Please select both staff and job",
        variant: "destructive",
      });
      return;
    }

    const staffId = parseInt(newSessionAssignment.staffId);
    const jobId = parseInt(newSessionAssignment.jobId);

    setSessionDefaults(prev => ({
      ...prev,
      customJobAssignments: {
        ...prev.customJobAssignments,
        allDays: [...prev.customJobAssignments.allDays, { staffId, jobId }],
      },
    }));

    setNewSessionAssignment({ staffId: "", jobId: "" });
    toast({
      title: "Assignment Added",
      description: `Added session-wide assignment`,
    });
  };

  const handleRemoveSessionCustomAssignment = (staffId: number, jobId: number) => {
    setSessionDefaults(prev => ({
      ...prev,
      customJobAssignments: {
        ...prev.customJobAssignments,
        allDays: prev.customJobAssignments.allDays.filter(a => !(a.staffId === staffId && a.jobId === jobId)),
      },
    }));
  };

  const handleAddSessionStaffToRemove = (staffId: string) => {
    const id = parseInt(staffId);
    if (!sessionDefaults.staffToRemove.includes(id)) {
      setSessionDefaults(prev => ({
        ...prev,
        staffToRemove: [...prev.staffToRemove, id],
      }));
    }
  };

  // Session-level custom staff (not in database)
  const [newSessionCustomStaff, setNewSessionCustomStaff] = useState<Omit<CustomStaff, 'staff_id'>>({
    staff_name: "",
    group_id: 0,
    job_type: 1005, // Default to Counselor
  });

  const handleAddSessionCustomStaff = () => {
    if (!newSessionCustomStaff.staff_name || !newSessionCustomStaff.group_id || !newSessionCustomStaff.job_type) {
      toast({
        title: "Invalid Input",
        description: "Please fill in staff name, group, and job type",
        variant: "destructive",
      });
      return;
    }

    const autoGeneratedId = sessionStaffCounter + Date.now() % 1000; // Unique ID in 8000+ range
    
    setSessionDefaults(prev => ({
      ...prev,
      staffToAdd: [...prev.staffToAdd, {
        staff_id: autoGeneratedId,
        staff_name: newSessionCustomStaff.staff_name,
        group_id: newSessionCustomStaff.group_id,
        job_type: newSessionCustomStaff.job_type,
      }],
    }));

    setSessionStaffCounter(prev => prev + 1);
    setNewSessionCustomStaff({ staff_name: "", group_id: 0, job_type: 1005 });
    toast({
      title: "Staff Added",
      description: `${newSessionCustomStaff.staff_name} added to session defaults`,
    });
  };

  const handleRemoveSessionCustomStaff = (staffId: number) => {
    setSessionDefaults(prev => ({
      ...prev,
      staffToAdd: prev.staffToAdd.filter(s => s.staff_id !== staffId),
    }));
  };

  const handleRemoveSessionStaffFromRemove = (staffId: number) => {
    setSessionDefaults(prev => ({
      ...prev,
      staffToRemove: prev.staffToRemove.filter(id => id !== staffId),
    }));
  };

  const handleConfigTabChange = (value: string) => {
    setConfigTab(value);
    // Sync activeWeek when selecting a week tab
    if (value.startsWith("week-")) {
      const weekNum = parseInt(value.replace("week-", ""));
      if (!isNaN(weekNum)) {
        setActiveWeek(weekNum);
      }
    }
  };

  const adjustWeekConfigs = (targetCount: number) => {
    if (targetCount === weekConfigs.length) return;
    
    if (targetCount > weekConfigs.length) {
      // Add more weeks
      const newConfigs = [...weekConfigs];
      for (let i = weekConfigs.length + 1; i <= targetCount; i++) {
        newConfigs.push(createDefaultWeekConfig(i));
      }
      setWeekConfigs(newConfigs);
    } else {
      // Remove weeks from the end
      setWeekConfigs(weekConfigs.slice(0, targetCount));
      // Reset configTab if it points to a removed week
      if (configTab.startsWith("week-")) {
        const currentWeek = parseInt(configTab.replace("week-", ""));
        if (currentWeek > targetCount) {
          setConfigTab("full-session");
        }
      }
      if (activeWeek > targetCount) {
        setActiveWeek(targetCount);
      }
    }
  };

  const updateWeekConfig = (weekNumber: number, updates: Partial<WeekConfig>) => {
    setWeekConfigs(configs =>
      configs.map(c =>
        c.weekNumber === weekNumber ? { ...c, ...updates } : c
      )
    );
  };

  const getActiveConfig = () => {
    return weekConfigs.find(c => c.weekNumber === activeWeek) || weekConfigs[0];
  };

  // Add staff to remove
  const handleAddStaffToRemove = (staffId: string) => {
    const config = getActiveConfig();
    const id = parseInt(staffId);
    if (!config.staffToRemove.includes(id)) {
      updateWeekConfig(activeWeek, {
        staffToRemove: [...config.staffToRemove, id],
      });
    }
  };

  const handleRemoveFromRemoveList = (staffId: number) => {
    const config = getActiveConfig();
    updateWeekConfig(activeWeek, {
      staffToRemove: config.staffToRemove.filter(id => id !== staffId),
    });
  };

  // Add custom staff not in database
  const [newCustomStaff, setNewCustomStaff] = useState<Omit<CustomStaff, 'staff_id'> & { staff_id?: number }>({
    staff_name: "",
    group_id: 0,
    job_type: 1005, // Default to Counselor
  });

  // Separate counters for auto-generating unique staff IDs
  // Session-level: 8000+, Week-level: 9000+
  const [sessionStaffCounter, setSessionStaffCounter] = useState(8000);
  const [weekStaffCounter, setWeekStaffCounter] = useState(9000);

  const handleAddCustomStaff = () => {
    if (!newCustomStaff.staff_name || !newCustomStaff.group_id || !newCustomStaff.job_type) {
      toast({
        title: "Invalid Input",
        description: "Please fill in staff name, group, and job type",
        variant: "destructive",
      });
      return;
    }

    const config = getActiveConfig();
    const autoGeneratedId = weekStaffCounter + Date.now() % 1000; // Unique ID in 9000+ range
    
    updateWeekConfig(activeWeek, {
      staffToAdd: [...config.staffToAdd, {
        staff_id: autoGeneratedId,
        staff_name: newCustomStaff.staff_name,
        group_id: newCustomStaff.group_id,
        job_type: newCustomStaff.job_type,
      }],
    });

    setWeekStaffCounter(prev => prev + 1);
    setNewCustomStaff({ staff_name: "", group_id: 0, job_type: 1005 });
    toast({
      title: "Staff Added",
      description: `${newCustomStaff.staff_name} added to week ${activeWeek}`,
    });
  };

  const handleRemoveCustomStaff = (staffId: number) => {
    const config = getActiveConfig();
    updateWeekConfig(activeWeek, {
      staffToAdd: config.staffToAdd.filter(s => s.staff_id !== staffId),
    });
  };

  // Toggle day selections
  const handleToggleGameDay = (day: string) => {
    const config = getActiveConfig();
    const newDays = config.staffGameDays.includes(day)
      ? config.staffGameDays.filter(d => d !== day)
      : [...config.staffGameDays, day];
    updateWeekConfig(activeWeek, { staffGameDays: newDays });
  };

  const handleToggleTieDyeDay = (day: string) => {
    const config = getActiveConfig();
    const newDays = config.tieDyeDays.includes(day)
      ? config.tieDyeDays.filter(d => d !== day)
      : [...config.tieDyeDays, day];
    updateWeekConfig(activeWeek, { tieDyeDays: newDays });
  };

  // Add tie dye staff
  const handleAddTieDyeStaff = (staffId: string) => {
    const config = getActiveConfig();
    const id = parseInt(staffId);
    if (!config.tieDyeStaff.includes(id)) {
      updateWeekConfig(activeWeek, {
        tieDyeStaff: [...config.tieDyeStaff, id],
      });
    }
  };

  const handleRemoveTieDyeStaff = (staffId: number) => {
    const config = getActiveConfig();
    updateWeekConfig(activeWeek, {
      tieDyeStaff: config.tieDyeStaff.filter(id => id !== staffId),
    });
  };

  // Week-level Arts & Crafts handlers
  const handleAddWeekArtsAndCraftsStaff = (staffId: string) => {
    const config = getActiveConfig();
    const id = parseInt(staffId);
    
    // Get the effective list (week-level or session defaults)
    const effectiveList = config.artsAndCraftsStaff.length > 0 
      ? config.artsAndCraftsStaff 
      : sessionDefaults.artsAndCraftsStaff;
    
    if (effectiveList.length >= 2) {
      toast({
        title: "Maximum Reached",
        description: "Arts & Crafts can only have 2 staff assigned",
        variant: "destructive",
      });
      return;
    }
    
    // If currently using session defaults, copy them first then add the new one
    if (config.artsAndCraftsStaff.length === 0 && sessionDefaults.artsAndCraftsStaff.length > 0) {
      updateWeekConfig(activeWeek, {
        artsAndCraftsStaff: [...sessionDefaults.artsAndCraftsStaff, id],
      });
    } else if (!config.artsAndCraftsStaff.includes(id)) {
      updateWeekConfig(activeWeek, {
        artsAndCraftsStaff: [...config.artsAndCraftsStaff, id],
      });
    }
  };

  // Remove session default staff from week view (copies effective list minus clicked one)
  const handleRemoveSessionDefaultArtsAndCrafts = (staffIdToRemove: number) => {
    const config = getActiveConfig();
    // Get the effective list - week's list if set, otherwise session defaults
    const effectiveList = config.artsAndCraftsStaff.length > 0 
      ? config.artsAndCraftsStaff 
      : sessionDefaults.artsAndCraftsStaff;
    // Filter from effective list
    const newList = effectiveList.filter(id => id !== staffIdToRemove);
    updateWeekConfig(activeWeek, {
      artsAndCraftsStaff: newList,
    });
  };

  const handleRemoveWeekArtsAndCraftsStaff = (staffId: number) => {
    const config = getActiveConfig();
    updateWeekConfig(activeWeek, {
      artsAndCraftsStaff: config.artsAndCraftsStaff.filter(id => id !== staffId),
    });
  };

  // Week-level Card Trading handlers
  const handleAddWeekCardTradingStaff = (staffId: string) => {
    const config = getActiveConfig();
    const id = parseInt(staffId);
    
    // Get the effective list (week-level or session defaults)
    const effectiveList = config.cardTradingStaff.length > 0 
      ? config.cardTradingStaff 
      : sessionDefaults.cardTradingStaff;
    
    if (effectiveList.length >= 2) {
      toast({
        title: "Maximum Reached",
        description: "Card Trading can only have 2 staff assigned",
        variant: "destructive",
      });
      return;
    }
    
    // If currently using session defaults, copy them first then add the new one
    if (config.cardTradingStaff.length === 0 && sessionDefaults.cardTradingStaff.length > 0) {
      updateWeekConfig(activeWeek, {
        cardTradingStaff: [...sessionDefaults.cardTradingStaff, id],
      });
    } else if (!config.cardTradingStaff.includes(id)) {
      updateWeekConfig(activeWeek, {
        cardTradingStaff: [...config.cardTradingStaff, id],
      });
    }
  };

  // Remove session default staff from week view (copies effective list minus clicked one)
  const handleRemoveSessionDefaultCardTrading = (staffIdToRemove: number) => {
    const config = getActiveConfig();
    // Get the effective list - week's list if set, otherwise session defaults
    const effectiveList = config.cardTradingStaff.length > 0 
      ? config.cardTradingStaff 
      : sessionDefaults.cardTradingStaff;
    // Filter from effective list
    const newList = effectiveList.filter(id => id !== staffIdToRemove);
    updateWeekConfig(activeWeek, {
      cardTradingStaff: newList,
    });
  };

  const handleRemoveWeekCardTradingStaff = (staffId: number) => {
    const config = getActiveConfig();
    updateWeekConfig(activeWeek, {
      cardTradingStaff: config.cardTradingStaff.filter(id => id !== staffId),
    });
  };

  // Week-level custom job assignment handlers (no day selection - just all days)
  const [newWeekAssignment, setNewWeekAssignment] = useState<{ staffId: string; jobId: string }>({
    staffId: "",
    jobId: "",
  });

  const handleAddWeekCustomAssignment = () => {
    if (!newWeekAssignment.staffId || !newWeekAssignment.jobId) {
      toast({
        title: "Missing Selection",
        description: "Please select both staff and job",
        variant: "destructive",
      });
      return;
    }

    const config = getActiveConfig();
    const staffId = parseInt(newWeekAssignment.staffId);
    const jobId = parseInt(newWeekAssignment.jobId);

    updateWeekConfig(activeWeek, {
      customJobAssignments: {
        ...config.customJobAssignments,
        allDays: [...config.customJobAssignments.allDays, { staffId, jobId }],
      },
    });

    setNewWeekAssignment({ staffId: "", jobId: "" });
  };

  const handleRemoveWeekCustomAssignment = (staffId: number, jobId: number, isAllDays: boolean, day?: string) => {
    const config = getActiveConfig();
    if (isAllDays) {
      updateWeekConfig(activeWeek, {
        customJobAssignments: {
          ...config.customJobAssignments,
          allDays: config.customJobAssignments.allDays.filter(a => !(a.staffId === staffId && a.jobId === jobId)),
        },
      });
    } else {
      updateWeekConfig(activeWeek, {
        customJobAssignments: {
          ...config.customJobAssignments,
          specificDays: config.customJobAssignments.specificDays.filter(a => !(a.staffId === staffId && a.jobId === jobId && a.day === day)),
        },
      });
    }
  };

  // Duplicate staff assignment detection - respects useSessionDefaults flag
  const [lastDuplicateKey, setLastDuplicateKey] = useState<string>("");
  
  useEffect(() => {
    const config = getActiveConfig();
    const useDefaults = config.useSessionDefaults;
    
    // Get effective lists considering session defaults AND useSessionDefaults flag
    const effectiveArtsAndCrafts = config.artsAndCraftsStaff.length > 0 
      ? config.artsAndCraftsStaff 
      : (useDefaults ? sessionDefaults.artsAndCraftsStaff : []);
    
    const effectiveCardTrading = config.cardTradingStaff.length > 0 
      ? config.cardTradingStaff 
      : (useDefaults ? sessionDefaults.cardTradingStaff : []);
    
    const tieDyeStaff = config.tieDyeStaff;
    
    // Include both all-day and specific-day custom job assignments
    const customJobAllDayStaff = config.customJobAssignments.allDays.map(a => a.staffId);
    const customJobSpecificDayStaff = config.customJobAssignments.specificDays.map(a => a.staffId);
    const sessionCustomJobAllDayStaff = useDefaults 
      ? sessionDefaults.customJobAssignments.allDays.map(a => a.staffId) 
      : [];
    const sessionCustomJobSpecificDayStaff = useDefaults 
      ? sessionDefaults.customJobAssignments.specificDays.map(a => a.staffId) 
      : [];

    // Find duplicates across sections
    const duplicates: { staffId: number; sections: string[] }[] = [];
    const allStaffAssignments = new Map<number, string[]>();

    // Add Arts & Crafts
    effectiveArtsAndCrafts.forEach(id => {
      if (!allStaffAssignments.has(id)) allStaffAssignments.set(id, []);
      allStaffAssignments.get(id)!.push("Arts & Crafts");
    });

    // Add Card Trading
    effectiveCardTrading.forEach(id => {
      if (!allStaffAssignments.has(id)) allStaffAssignments.set(id, []);
      allStaffAssignments.get(id)!.push("Card Trading");
    });

    // Add Tie Dye
    tieDyeStaff.forEach(id => {
      if (!allStaffAssignments.has(id)) allStaffAssignments.set(id, []);
      allStaffAssignments.get(id)!.push("Tie Dye");
    });

    // Add Custom Jobs (all-day and specific-day)
    const allCustomJobStaff = Array.from(new Set([
      ...customJobAllDayStaff, 
      ...customJobSpecificDayStaff,
      ...sessionCustomJobAllDayStaff,
      ...sessionCustomJobSpecificDayStaff,
    ]));
    allCustomJobStaff.forEach(id => {
      if (!allStaffAssignments.has(id)) allStaffAssignments.set(id, []);
      allStaffAssignments.get(id)!.push("Custom Job");
    });

    // Find staff with multiple assignments
    // Exception: Arts & Crafts + Tie Dye is allowed since A&C staff typically do tie dye
    allStaffAssignments.forEach((sections, staffId) => {
      if (sections.length > 1) {
        // Check if it's only Arts & Crafts and Tie Dye - this is allowed
        const isArtsAndTieDyeOnly = sections.length === 2 && 
          sections.includes("Arts & Crafts") && 
          sections.includes("Tie Dye");
        
        if (!isArtsAndTieDyeOnly) {
          duplicates.push({ staffId, sections });
        }
      }
    });

    // Create a unique key for current duplicates to prevent repeated toasts
    const duplicateKey = duplicates.map(d => `${d.staffId}:${d.sections.join(",")}`).sort().join("|");
    
    // Show warning toast if duplicates found and it's a new set of duplicates
    if (duplicates.length > 0 && duplicateKey !== lastDuplicateKey) {
      const staffNames = duplicates.map(d => {
        const staff = eligibleStaff.find(s => s.staff_id === d.staffId);
        return `${staff?.staff_name || `Staff ${d.staffId}`} (${d.sections.join(" & ")})`;
      });

      setLastDuplicateKey(duplicateKey);
      toast({
        title: "Duplicate Assignments Detected",
        description: `The following staff are assigned to multiple jobs in Week ${activeWeek}: ${staffNames.join(", ")}. Consider removing duplicate assignments.`,
        className: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
        duration: 8000,
      });
    } else if (duplicates.length === 0 && lastDuplicateKey !== "") {
      setLastDuplicateKey("");
    }
  }, [
    weekConfigs, 
    activeWeek, 
    sessionDefaults.artsAndCraftsStaff, 
    sessionDefaults.cardTradingStaff,
    sessionDefaults.customJobAssignments.allDays,
    sessionDefaults.customJobAssignments.specificDays,
    eligibleStaff,
    lastDuplicateKey,
  ]);

  // Generate JSON configuration - merges session defaults with week config
  const generateJsonConfig = (config: WeekConfig) => {
    const patternBasedJobs: Record<string, number[]> = {};
    config.patternBasedJobs.forEach(p => {
      patternBasedJobs[p.staffId.toString()] = p.jobIds;
    });

    // Merge session defaults with week-specific overrides
    const useDefaults = config.useSessionDefaults;
    
    // Merge custom job assignments
    const mergedAllDays = [
      ...(useDefaults ? sessionDefaults.customJobAssignments.allDays : []),
      ...config.customJobAssignments.allDays,
    ];
    const mergedSpecificDays = [
      ...(useDefaults ? sessionDefaults.customJobAssignments.specificDays : []),
      ...config.customJobAssignments.specificDays,
    ];

    // Add Arts & Crafts - use week-level if set, otherwise fall back to session defaults
    if (artsAndCraftsJobId) {
      const artsStaff = config.artsAndCraftsStaff.length > 0 
        ? config.artsAndCraftsStaff 
        : (useDefaults ? sessionDefaults.artsAndCraftsStaff : []);
      artsStaff.forEach(staffId => {
        mergedAllDays.push({ staffId, jobId: artsAndCraftsJobId });
      });
    }

    // Add Card Trading - use week-level if set, otherwise fall back to session defaults
    if (cardTradingJobId) {
      const cardStaff = config.cardTradingStaff.length > 0 
        ? config.cardTradingStaff 
        : (useDefaults ? sessionDefaults.cardTradingStaff : []);
      cardStaff.forEach(staffId => {
        mergedAllDays.push({ staffId, jobId: cardTradingJobId });
      });
    }

    const customJobAssignments = {
      all_days: {} as Record<string, number[]>,
      specific_days: mergedSpecificDays.map(a => [a.staffId, a.jobId, a.day]),
    };

    mergedAllDays.forEach(a => {
      if (!customJobAssignments.all_days[a.jobId.toString()]) {
        customJobAssignments.all_days[a.jobId.toString()] = [];
      }
      if (!customJobAssignments.all_days[a.jobId.toString()].includes(a.staffId)) {
        customJobAssignments.all_days[a.jobId.toString()].push(a.staffId);
      }
    });

    // Staff to remove - merge session and week level
    const mergedStaffToRemove = useDefaults
      ? Array.from(new Set([...sessionDefaults.staffToRemove, ...config.staffToRemove]))
      : config.staffToRemove;

    // Staff to add - merge session and week level with job_type
    const mergedStaffToAdd = useDefaults
      ? [...sessionDefaults.staffToAdd, ...config.staffToAdd]
      : config.staffToAdd;

    return {
      session_id: selectedSessionId,
      pattern_based_jobs: patternBasedJobs,
      staff_game_days: config.staffGameDays,
      tie_dye_days: config.tieDyeDays,
      tie_dye_staff: config.tieDyeStaff,
      staff_to_remove: mergedStaffToRemove,
      staff_to_add: mergedStaffToAdd.map(s => ({
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        group_id: s.group_id,
        job_type: s.job_type,
        ...(s.actual_assignment && { actual_assignment: s.actual_assignment }),
      })),
      custom_job_assignments: customJobAssignments,
      debug: config.debug,
      verbose: config.verbose,
    };
  };

  // File input ref for upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download full configuration (for reloading later)
  const handleDownloadConfig = () => {
    const fullConfig = {
      version: 1,
      sessionId: selectedSessionId,
      numberOfWeeks,
      sessionDefaults,
      weekConfigs,
    };
    const blob = new Blob([JSON.stringify(fullConfig, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lunchjob_config_session_${selectedSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Configuration saved - you can upload this file later to restore your settings",
    });
  };

  // Upload and restore configuration
  const handleUploadConfig = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const config = JSON.parse(content);

        // Validate the config structure
        if (!config.sessionId || !config.weekConfigs || !Array.isArray(config.weekConfigs)) {
          throw new Error("Invalid configuration file format");
        }

        // Restore state
        setSelectedSessionId(config.sessionId);
        
        if (config.numberOfWeeks) {
          setNumberOfWeeks(config.numberOfWeeks);
        }
        
        if (config.sessionDefaults) {
          setSessionDefaults(config.sessionDefaults);
        }
        
        if (config.weekConfigs) {
          setWeekConfigs(config.weekConfigs);
        }

        toast({
          title: "Configuration Loaded",
          description: `Loaded settings for Session ${config.sessionId} with ${config.weekConfigs.length} weeks`,
        });
      } catch (error: any) {
        toast({
          title: "Upload Failed",
          description: error.message || "Could not parse configuration file",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    
    // Reset input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
    setValidationResult(null);  // Clear stale validation
    setAssignmentResults([]);   // Clear stale assignments
    logStream.clearLogs();
    logStream.info("Starting lunch job assignment generation");
    logStream.info(`Session: ${formatSessionDisplay(selectedSessionId)}`);
    logStream.info(`Weeks configured: ${weekConfigs.length}`);
    
    try {
      logStream.info("Preparing configuration...");
      const configs = weekConfigs.map(generateJsonConfig);
      logStream.debug("Configuration prepared", JSON.stringify(configs).slice(0, 100) + "...");
      
      logStream.info("Sending request to server...");
      const response = await apiRequest("POST", "/api/execute/lunch-jobs", {
        sessionId: selectedSessionId,
        weekConfigs: configs,
        days: DAYS,
      });

      const data = await response.json();
      
      // Handle new format: { assignments: [...], validation: {...} }
      // Also support legacy format: results as array directly
      let assignments: AssignmentResult[] = [];
      let validation: ValidationResult | null = null;
      
      if (data.results) {
        if (Array.isArray(data.results)) {
          // Legacy format
          assignments = data.results;
        } else if (data.results.assignments && Array.isArray(data.results.assignments)) {
          // New format with validation
          assignments = data.results.assignments;
          validation = data.results.validation || null;
        }
      }
      
      // Always set validation if present
      if (validation) {
        setValidationResult(validation);
        
        // Log validation result
        if (validation.groupCoverage) {
          if (validation.groupCoverage.passed) {
            logStream.success(validation.groupCoverage.message);
          } else {
            logStream.warn(`Validation warning: ${validation.groupCoverage.message}`);
            if (validation.groupCoverage.noWorkingIssues.length > 0) {
              logStream.warn(`Groups with no staff working: ${validation.groupCoverage.noWorkingIssues.length} issues`);
            }
            if (validation.groupCoverage.allWorkingIssues.length > 0) {
              logStream.warn(`Groups with all staff working: ${validation.groupCoverage.allWorkingIssues.length} issues`);
            }
          }
        }
      }
      
      if (assignments.length > 0) {
        setAssignmentResults(assignments);
        logStream.success(`Generated ${assignments.length} assignments successfully`);
        
        // Log summary by week
        const byWeek = assignments.reduce((acc: Record<number, number>, r: AssignmentResult) => {
          const week = r.week || 1;
          acc[week] = (acc[week] || 0) + 1;
          return acc;
        }, {});
        Object.entries(byWeek).forEach(([week, count]) => {
          logStream.info(`Week ${week}: ${count} assignments`);
        });
        
        setOutputTab("summary");
        toast({
          title: "Success",
          description: `Generated ${assignments.length} assignments`,
        });
      } else if (data.success) {
        logStream.success(data.message || "Assignments generated successfully");
        toast({
          title: "Success",
          description: data.message || "Assignments generated successfully",
        });
      } else if (validation && !validation.groupCoverage.passed) {
        // Show validation warnings even with no assignments
        toast({
          title: "Warning",
          description: validation.groupCoverage.message,
          variant: "destructive",
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

  const getStaffName = (staffId: number) => {
    const staff = eligibleStaff.find(s => s.staff_id === staffId);
    if (staff) return staff.staff_name;
    
    // Check custom staff
    for (const config of weekConfigs) {
      const custom = config.staffToAdd.find(s => s.staff_id === staffId);
      if (custom) return custom.staff_name;
    }
    
    return `Staff #${staffId}`;
  };

  const getJobName = (jobId: number) => {
    const job = lunchJobs.find(j => j.job_id === jobId);
    return job ? job.job_name : `Job #${jobId}`;
  };

  const formatSessionDisplay = (sessionId: number) => {
    if (sessionId === 1012) return "Session 1 - 2025";
    if (sessionId === 1015) return "Session 2 - 2025";
    return `Session ${sessionId}`;
  };

  const activeConfig = getActiveConfig();

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
                Lunchtime Jobs Assigner
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Generate multi-week lunchtime job assignments
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
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Session Selection
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Select a camp session or upload a saved configuration
                  </CardDescription>
                </div>
                <div className="shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    data-testid="button-upload-config"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Config
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUploadConfig}
                    accept=".json"
                    className="hidden"
                    data-testid="input-upload-config"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end flex-wrap">
                <div className="flex-1 min-w-[200px] space-y-2">
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
                <div className="flex gap-2 items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshDataMutation.mutate()}
                    disabled={refreshDataMutation.isPending}
                    data-testid="button-refresh-data"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshDataMutation.isPending ? "animate-spin" : ""}`} />
                    {refreshDataMutation.isPending ? "Refreshing..." : "Refresh Data"}
                  </Button>
                  {selectedSessionId && (
                    <>
                      <Badge variant="outline" className="py-2">
                        <Users className="h-3 w-3 mr-1" />
                        {staffLoading ? "..." : `${eligibleStaff.length} staff`}
                      </Badge>
                      <Badge variant="outline" className="py-2">
                        {jobsLoading ? "..." : `${lunchJobs.length} jobs`}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configuration with Full Session and Weeks tabs */}
          {selectedSessionId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuration
                </CardTitle>
                <CardDescription className="mt-2">
                  Set session-wide defaults or customize individual weeks to specify staff game days, tie dye days and staff, partial sessions for staff and more
                </CardDescription>
              </CardHeader>
              <CardContent>

                <Tabs value={configTab} onValueChange={handleConfigTabChange}>
                  <TabsList className="mb-4 flex-nowrap overflow-x-auto overflow-y-hidden w-full scrollbar-thin inline-flex justify-start">
                    <TabsTrigger value="full-session" data-testid="tab-full-session" className="shrink-0">
                      <Calendar className="h-4 w-4 mr-2" />
                      Full Session
                    </TabsTrigger>
                    {weekConfigs.map((config) => (
                      <TabsTrigger 
                        key={config.weekNumber} 
                        value={`week-${config.weekNumber}`} 
                        data-testid={`tab-week-${config.weekNumber}`}
                        className="shrink-0"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Week {config.weekNumber}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {/* Full Session Tab */}
                  <TabsContent value="full-session" className="space-y-6">
                    {/* Number of Weeks Selector */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <Label className="text-base font-medium">Number of Weeks</Label>
                          <p className="text-sm text-muted-foreground">
                            Select how many weeks to configure for this session
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={weeksInputValue}
                            onChange={(e) => setWeeksInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const num = parseInt(weeksInputValue);
                                if (num >= 1 && num <= 10) {
                                  setNumberOfWeeks(num);
                                  adjustWeekConfigs(num);
                                } else {
                                  setWeeksInputValue(numberOfWeeks.toString());
                                  toast({
                                    title: "Invalid Number",
                                    description: "Please enter a number between 1 and 10",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                            onBlur={() => setWeeksInputValue(numberOfWeeks.toString())}
                            className="w-14 text-center font-medium pr-1"
                            data-testid="input-number-of-weeks"
                          />
                          <span className="text-sm text-muted-foreground">weeks (press Enter)</span>
                        </div>
                      </div>
                    </div>

                    {/* Hardcoded Assignments Section - Collapsible */}
                    <Collapsible open={hardcodedOpen} onOpenChange={setHardcodedOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between p-4 border rounded-lg h-auto hover-elevate" data-testid="toggle-session-hardcoded">
                          <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <div className="text-left">
                              <span className="font-medium">Hardcoded Job Assignments</span>
                              <p className="text-xs text-muted-foreground font-normal">
                                Assign staff to specific jobs for all weeks on their scheduled work days
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {(sessionDefaults.artsAndCraftsStaff.length + sessionDefaults.cardTradingStaff.length + sessionDefaults.customJobAssignments.allDays.length) > 0 && (
                              <Badge variant="secondary">
                                {sessionDefaults.artsAndCraftsStaff.length + sessionDefaults.cardTradingStaff.length + sessionDefaults.customJobAssignments.allDays.length} assigned
                              </Badge>
                            )}
                            <ChevronDown className={`h-4 w-4 transition-transform ${hardcodedOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border border-t-0 rounded-b-lg p-4 space-y-4">
                      {/* Arts & Crafts */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-base">Arts & Crafts</Label>
                            <p className="text-xs text-muted-foreground">Select 2 staff members</p>
                          </div>
                          <Badge variant={sessionDefaults.artsAndCraftsStaff.length === 2 ? "default" : "outline"}>
                            {sessionDefaults.artsAndCraftsStaff.length}/2
                          </Badge>
                        </div>
                        <Combobox
                          options={filteredStaffOptions.filter(s => !sessionDefaults.artsAndCraftsStaff.includes(parseInt(s.value)))}
                          value=""
                          onValueChange={handleAddArtsAndCraftsStaff}
                          placeholder="Add staff..."
                          searchPlaceholder="Search staff..."
                          emptyText="No staff found."
                          className="w-full"
                          testId="select-arts-crafts-staff"
                        />
                        {sessionDefaults.artsAndCraftsStaff.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {sessionDefaults.artsAndCraftsStaff.map((staffId) => (
                              <Badge key={staffId} variant="secondary" className="gap-1">
                                {getStaffName(staffId)}
                                <button onClick={() => handleRemoveArtsAndCraftsStaff(staffId)}>
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Trading */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-base">Card Trading</Label>
                            <p className="text-xs text-muted-foreground">Select 2 staff members</p>
                          </div>
                          <Badge variant={sessionDefaults.cardTradingStaff.length === 2 ? "default" : "outline"}>
                            {sessionDefaults.cardTradingStaff.length}/2
                          </Badge>
                        </div>
                        <Combobox
                          options={filteredStaffOptions.filter(s => !sessionDefaults.cardTradingStaff.includes(parseInt(s.value)))}
                          value=""
                          onValueChange={handleAddCardTradingStaff}
                          placeholder="Add staff..."
                          searchPlaceholder="Search staff..."
                          emptyText="No staff found."
                          className="w-full"
                          testId="select-card-trading-staff"
                        />
                        {sessionDefaults.cardTradingStaff.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {sessionDefaults.cardTradingStaff.map((staffId) => (
                              <Badge key={staffId} variant="secondary" className="gap-1">
                                {getStaffName(staffId)}
                                <button onClick={() => handleRemoveCardTradingStaff(staffId)}>
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Custom Staff-to-Job Assignment */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <div>
                          <Label className="text-base">Additional Job Assignments</Label>
                          <p className="text-xs text-muted-foreground">Assign any staff to any job (applies on their scheduled work days)</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Combobox
                            options={filteredStaffOptions}
                            value={newSessionAssignment.staffId}
                            onValueChange={(v) => setNewSessionAssignment(prev => ({ ...prev, staffId: v }))}
                            placeholder="Select staff..."
                            searchPlaceholder="Search staff..."
                            emptyText="No staff found."
                            testId="select-custom-assign-staff"
                          />
                          <Select
                            value={newSessionAssignment.jobId}
                            onValueChange={(v) => setNewSessionAssignment(prev => ({ ...prev, jobId: v }))}
                          >
                            <SelectTrigger data-testid="select-custom-assign-job">
                              <SelectValue placeholder="Select job..." />
                            </SelectTrigger>
                            <SelectContent>
                              {lunchJobs.map((job) => (
                                <SelectItem key={job.job_id} value={job.job_id.toString()}>
                                  {job.job_name} ({job.job_code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button onClick={handleAddSessionCustomAssignment} data-testid="button-add-custom-assign">
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                        
                        {/* Display existing custom assignments */}
                        {sessionDefaults.customJobAssignments.allDays.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {sessionDefaults.customJobAssignments.allDays.map((a, i) => (
                              <div key={`all-${i}`} className="flex items-center justify-between p-2 bg-muted rounded">
                                <span className="text-sm">
                                  {getStaffName(a.staffId)} → {getJobName(a.jobId)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveSessionCustomAssignment(a.staffId, a.jobId)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Collapsible Advanced Options */}
                    <div className="space-y-4 pt-4 border-t">
                      <h3 className="text-lg font-medium text-muted-foreground">Advanced Options</h3>
                      
                      {/* Staff to Exclude - Collapsible */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-4 border rounded-lg h-auto" data-testid="toggle-session-staff-exclude">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Staff to Exclude (All Weeks)</span>
                              {sessionDefaults.staffToRemove.length > 0 && (
                                <Badge variant="secondary">{sessionDefaults.staffToRemove.length} selected</Badge>
                              )}
                            </div>
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border border-t-0 rounded-b-lg p-4 space-y-3">
                          <p className="text-xs text-muted-foreground">Staff members who should not be assigned any week</p>
                          <Combobox
                            options={staffOptions}
                            value=""
                            onValueChange={handleAddSessionStaffToRemove}
                            placeholder="Add staff to exclude..."
                            searchPlaceholder="Search staff..."
                            emptyText="No staff found."
                            className="w-full"
                            testId="select-session-exclude-staff"
                          />
                          {sessionDefaults.staffToRemove.length > 0 && (
                            <div className="flex gap-2 flex-wrap mt-2">
                              {sessionDefaults.staffToRemove.map((staffId) => (
                                <Badge key={staffId} variant="destructive" className="gap-1">
                                  {getStaffName(staffId)}
                                  <button onClick={() => handleRemoveSessionStaffFromRemove(staffId)}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Add Staff Not in Database - Collapsible */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-4 border rounded-lg h-auto" data-testid="toggle-session-add-staff">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Add Staff Not in Database</span>
                              {sessionDefaults.staffToAdd.length > 0 && (
                                <Badge variant="secondary">{sessionDefaults.staffToAdd.length} added</Badge>
                              )}
                            </div>
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border border-t-0 rounded-b-lg p-4 space-y-3">
                          <p className="text-xs text-muted-foreground">Add temporary staff for all weeks' assignments</p>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <Input
                              placeholder="Staff Name"
                              value={newSessionCustomStaff.staff_name}
                              onChange={(e) => setNewSessionCustomStaff({ ...newSessionCustomStaff, staff_name: e.target.value })}
                              data-testid="input-session-custom-staff-name"
                            />
                            <Select
                              value={newSessionCustomStaff.job_type?.toString() || "1005"}
                              onValueChange={(v) => setNewSessionCustomStaff({ ...newSessionCustomStaff, job_type: parseInt(v) })}
                            >
                              <SelectTrigger data-testid="select-session-custom-staff-job-type">
                                <SelectValue placeholder="Job Type" />
                              </SelectTrigger>
                              <SelectContent>
                                {JOB_TYPES.map((jt) => (
                                  <SelectItem key={jt.value} value={jt.value.toString()}>
                                    {jt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={newSessionCustomStaff.group_id?.toString() || ""}
                              onValueChange={(v) => setNewSessionCustomStaff({ ...newSessionCustomStaff, group_id: parseInt(v) })}
                            >
                              <SelectTrigger data-testid="select-session-custom-staff-group">
                                <SelectValue placeholder="Group" />
                              </SelectTrigger>
                              <SelectContent>
                                {groupOptions.map((g) => (
                                  <SelectItem key={g.value} value={g.value}>
                                    {g.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button onClick={handleAddSessionCustomStaff} data-testid="button-session-add-custom-staff">
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>
                          {sessionDefaults.staffToAdd.length > 0 && (
                            <div className="mt-3 border rounded p-3 space-y-2">
                              {sessionDefaults.staffToAdd.map((staff) => (
                                <div key={staff.staff_id} className="flex items-center justify-between p-2 bg-muted rounded">
                                  <span className="text-sm">
                                    {staff.staff_name} ({JOB_TYPES.find(jt => jt.value === staff.job_type)?.label || "Unknown"}, Group {staff.group_id})
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveSessionCustomStaff(staff.staff_id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </TabsContent>

                  {/* Individual Week Tabs */}
                  {weekConfigs.map((config) => (
                    <TabsContent key={config.weekNumber} value={`week-${config.weekNumber}`} className="space-y-4">
                      {/* Week Schedule Section - Collapsible */}
                      <Collapsible open={weekScheduleOpen} onOpenChange={setWeekScheduleOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-4 border rounded-lg h-auto hover-elevate" data-testid={`toggle-week-${config.weekNumber}-schedule`}>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div className="text-left">
                                <span className="font-medium">Week Schedule</span>
                                <p className="text-xs text-muted-foreground font-normal">
                                  Staff games and tie dye days
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {(config.staffGameDays.length + config.tieDyeDays.length) > 0 && (
                                <Badge variant="secondary">
                                  {config.staffGameDays.length + config.tieDyeDays.length} days
                                </Badge>
                              )}
                              <ChevronDown className={`h-4 w-4 transition-transform ${weekScheduleOpen ? 'rotate-180' : ''}`} />
                            </div>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border border-t-0 rounded-b-lg p-4 space-y-4">
                          {/* Staff Game Days */}
                          <div className="space-y-2">
                            <Label>Staff Game Days</Label>
                            <p className="text-xs text-muted-foreground">Select days when staff games are scheduled</p>
                            <div className="flex gap-2 flex-wrap">
                              {DAYS.map((day) => (
                                <Button
                                  key={day}
                                  variant={config.staffGameDays.includes(day) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleToggleGameDay(day)}
                                  className="capitalize"
                                  data-testid={`button-gameday-${day}`}
                                >
                                  {day}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {/* Tie Dye Days */}
                          <div className="space-y-2">
                            <Label>Tie Dye Days</Label>
                            <p className="text-xs text-muted-foreground">Select days when tie dye activities are scheduled</p>
                            <div className="flex gap-2 flex-wrap">
                              {DAYS.map((day) => (
                                <Button
                                  key={day}
                                  variant={config.tieDyeDays.includes(day) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleToggleTieDyeDay(day)}
                                  className="capitalize"
                                  data-testid={`button-tiedye-${day}`}
                                >
                                  {day}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {/* Tie Dye Staff */}
                          {config.tieDyeDays.length > 0 && (
                            <div className="space-y-2">
                              <Label>Tie Dye Staff</Label>
                              <p className="text-xs text-muted-foreground">Staff assigned to tie dye on selected days</p>
                              <div className="flex gap-2">
                                <Combobox
                                  options={filteredStaffOptions}
                                  value=""
                                  onValueChange={handleAddTieDyeStaff}
                                  placeholder="Add staff..."
                                  searchPlaceholder="Search staff..."
                                  emptyText="No staff found."
                                  className="flex-1"
                                  testId="select-tiedye-staff"
                                />
                              </div>
                              {config.tieDyeStaff.length > 0 && (
                                <div className="flex gap-2 flex-wrap mt-2">
                                  {config.tieDyeStaff.map((staffId) => (
                                    <Badge key={staffId} variant="secondary" className="gap-1">
                                      {getStaffName(staffId)}
                                      <button onClick={() => handleRemoveTieDyeStaff(staffId)}>
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Hardcoded Assignments Section - Collapsible */}
                      <Collapsible open={weekHardcodedOpen} onOpenChange={setWeekHardcodedOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-4 border rounded-lg h-auto hover-elevate" data-testid={`toggle-week-${config.weekNumber}-hardcoded`}>
                            <div className="flex items-center gap-2">
                              <Settings className="h-4 w-4 text-muted-foreground" />
                              <div className="text-left">
                                <span className="font-medium">Hardcoded Job Assignments</span>
                                <p className="text-xs text-muted-foreground font-normal">
                                  Staff assigned to specific jobs this week (overrides session defaults)
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {((config.artsAndCraftsStaff.length > 0 ? config.artsAndCraftsStaff.length : sessionDefaults.artsAndCraftsStaff.length) + 
                                (config.cardTradingStaff.length > 0 ? config.cardTradingStaff.length : sessionDefaults.cardTradingStaff.length) + 
                                config.customJobAssignments.allDays.length) > 0 && (
                                <Badge variant="secondary">
                                  {(config.artsAndCraftsStaff.length > 0 ? config.artsAndCraftsStaff.length : sessionDefaults.artsAndCraftsStaff.length) + 
                                   (config.cardTradingStaff.length > 0 ? config.cardTradingStaff.length : sessionDefaults.cardTradingStaff.length) + 
                                   config.customJobAssignments.allDays.length} assigned
                                </Badge>
                              )}
                              <ChevronDown className={`h-4 w-4 transition-transform ${weekHardcodedOpen ? 'rotate-180' : ''}`} />
                            </div>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border border-t-0 rounded-b-lg p-4 space-y-4">

                        {/* Arts & Crafts */}
                        <div className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm">Arts & Crafts</Label>
                              <p className="text-xs text-muted-foreground">Select up to 2 staff</p>
                            </div>
                            <Badge variant={(config.artsAndCraftsStaff.length > 0 ? config.artsAndCraftsStaff.length : sessionDefaults.artsAndCraftsStaff.length) === 2 ? "default" : "outline"} className="text-xs">
                              {config.artsAndCraftsStaff.length > 0 ? config.artsAndCraftsStaff.length : sessionDefaults.artsAndCraftsStaff.length}/2
                            </Badge>
                          </div>
                          <Combobox
                            options={filteredStaffOptions.filter(s => {
                              const id = parseInt(s.value);
                              const currentList = config.artsAndCraftsStaff.length > 0 ? config.artsAndCraftsStaff : sessionDefaults.artsAndCraftsStaff;
                              return !currentList.includes(id);
                            })}
                            value=""
                            onValueChange={handleAddWeekArtsAndCraftsStaff}
                            placeholder="Add staff..."
                            searchPlaceholder="Search staff..."
                            emptyText="No staff found."
                            className="w-full"
                            testId={`select-week-${config.weekNumber}-arts-crafts`}
                          />
                          {/* Show week-level overrides */}
                          {config.artsAndCraftsStaff.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {config.artsAndCraftsStaff.map((staffId) => (
                                <Badge key={staffId} variant="secondary" className="gap-1">
                                  {getStaffName(staffId)}
                                  <button onClick={() => handleRemoveWeekArtsAndCraftsStaff(staffId)}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                          {/* Show session defaults as removable badges when no week-level override */}
                          {config.artsAndCraftsStaff.length === 0 && sessionDefaults.artsAndCraftsStaff.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {sessionDefaults.artsAndCraftsStaff.map((staffId) => (
                                <Badge key={staffId} variant="outline" className="gap-1">
                                  {getStaffName(staffId)} <span className="text-xs text-muted-foreground">(session)</span>
                                  <button onClick={() => handleRemoveSessionDefaultArtsAndCrafts(staffId)}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Card Trading */}
                        <div className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm">Card Trading</Label>
                              <p className="text-xs text-muted-foreground">Select up to 2 staff</p>
                            </div>
                            <Badge variant={(config.cardTradingStaff.length > 0 ? config.cardTradingStaff.length : sessionDefaults.cardTradingStaff.length) === 2 ? "default" : "outline"} className="text-xs">
                              {config.cardTradingStaff.length > 0 ? config.cardTradingStaff.length : sessionDefaults.cardTradingStaff.length}/2
                            </Badge>
                          </div>
                          <Combobox
                            options={filteredStaffOptions.filter(s => {
                              const id = parseInt(s.value);
                              const currentList = config.cardTradingStaff.length > 0 ? config.cardTradingStaff : sessionDefaults.cardTradingStaff;
                              return !currentList.includes(id);
                            })}
                            value=""
                            onValueChange={handleAddWeekCardTradingStaff}
                            placeholder="Add staff..."
                            searchPlaceholder="Search staff..."
                            emptyText="No staff found."
                            className="w-full"
                            testId={`select-week-${config.weekNumber}-card-trading`}
                          />
                          {/* Show week-level overrides */}
                          {config.cardTradingStaff.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {config.cardTradingStaff.map((staffId) => (
                                <Badge key={staffId} variant="secondary" className="gap-1">
                                  {getStaffName(staffId)}
                                  <button onClick={() => handleRemoveWeekCardTradingStaff(staffId)}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                          {/* Show session defaults as removable badges when no week-level override */}
                          {config.cardTradingStaff.length === 0 && sessionDefaults.cardTradingStaff.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {sessionDefaults.cardTradingStaff.map((staffId) => (
                                <Badge key={staffId} variant="outline" className="gap-1">
                                  {getStaffName(staffId)} <span className="text-xs text-muted-foreground">(session)</span>
                                  <button onClick={() => handleRemoveSessionDefaultCardTrading(staffId)}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Additional Job Assignments */}
                        <div className="border rounded-lg p-3 space-y-2">
                          <div>
                            <Label className="text-sm">Additional Job Assignments</Label>
                            <p className="text-xs text-muted-foreground">Assign any staff to any job (applies on their scheduled work days)</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Combobox
                              options={filteredStaffOptions}
                              value={newWeekAssignment.staffId}
                              onValueChange={(v) => setNewWeekAssignment(prev => ({ ...prev, staffId: v }))}
                              placeholder="Select staff..."
                              searchPlaceholder="Search staff..."
                              emptyText="No staff found."
                              testId={`select-week-${config.weekNumber}-custom-staff`}
                            />
                            <Select
                              value={newWeekAssignment.jobId}
                              onValueChange={(v) => setNewWeekAssignment(prev => ({ ...prev, jobId: v }))}
                            >
                              <SelectTrigger data-testid={`select-week-${config.weekNumber}-custom-job`}>
                                <SelectValue placeholder="Select job..." />
                              </SelectTrigger>
                              <SelectContent>
                                {lunchJobs.map((job) => (
                                  <SelectItem key={job.job_id} value={job.job_id.toString()}>
                                    {job.job_name} ({job.job_code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button onClick={handleAddWeekCustomAssignment} data-testid={`button-week-${config.weekNumber}-add-custom`}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>
                          
                          {config.customJobAssignments.allDays.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {config.customJobAssignments.allDays.map((a, i) => (
                                <div key={`all-${i}`} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                                  <span>
                                    {getStaffName(a.staffId)} → {getJobName(a.jobId)}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveWeekCustomAssignment(a.staffId, a.jobId, true)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Collapsible Advanced Options */}
                      <div className="space-y-3 pt-4 border-t">
                        <p className="text-sm font-medium text-muted-foreground">Advanced Options</p>
                        <p className="text-sm text-muted-foreground">Use these options to specify staff who are working partial sessions</p>
                        
                        {/* Staff to Exclude - Collapsible */}
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="w-full justify-between p-3 border rounded-lg h-auto" data-testid={`toggle-week-${config.weekNumber}-staff-exclude`}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Staff to Exclude</span>
                                {(sessionDefaults.staffToRemove.length + config.staffToRemove.length) > 0 && (
                                  <Badge variant="secondary" className="text-xs">{sessionDefaults.staffToRemove.length + config.staffToRemove.length} excluded</Badge>
                                )}
                              </div>
                              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="border border-t-0 rounded-b-lg p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">Staff members who should not be assigned this week</p>
                            <Combobox
                              options={staffOptions.filter(s => 
                                !sessionDefaults.staffToRemove.includes(parseInt(s.value)) && 
                                !config.staffToRemove.includes(parseInt(s.value))
                              )}
                              value=""
                              onValueChange={handleAddStaffToRemove}
                              placeholder="Add staff to exclude..."
                              searchPlaceholder="Search staff..."
                              emptyText="No staff found."
                              className="w-full"
                              testId={`select-week-${config.weekNumber}-exclude-staff`}
                            />
                            {/* Show session-level exclusions */}
                            {sessionDefaults.staffToRemove.length > 0 && (
                              <div className="flex gap-2 flex-wrap">
                                {sessionDefaults.staffToRemove.map((staffId) => (
                                  <Badge key={`session-${staffId}`} variant="outline" className="gap-1 border-destructive text-destructive text-xs">
                                    {getStaffName(staffId)} <span className="opacity-70">(session)</span>
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {/* Show week-level exclusions */}
                            {config.staffToRemove.length > 0 && (
                              <div className="flex gap-2 flex-wrap">
                                {config.staffToRemove.map((staffId) => (
                                  <Badge key={staffId} variant="destructive" className="gap-1 text-xs">
                                    {getStaffName(staffId)}
                                    <button onClick={() => handleRemoveFromRemoveList(staffId)}>
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>

                        {/* Add Staff Not in Database - Collapsible */}
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="w-full justify-between p-3 border rounded-lg h-auto" data-testid={`toggle-week-${config.weekNumber}-add-staff`}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Add Staff Not in Database</span>
                                {config.staffToAdd.length > 0 && (
                                  <Badge variant="secondary" className="text-xs">{config.staffToAdd.length} added</Badge>
                                )}
                              </div>
                              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="border border-t-0 rounded-b-lg p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">Add temporary staff for this week's assignments</p>
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                              <Input
                                placeholder="Staff Name"
                                value={newCustomStaff.staff_name}
                                onChange={(e) => setNewCustomStaff({ ...newCustomStaff, staff_name: e.target.value })}
                                data-testid={`input-week-${config.weekNumber}-custom-staff-name`}
                              />
                              <Select
                                value={newCustomStaff.job_type?.toString() || "1005"}
                                onValueChange={(v) => setNewCustomStaff({ ...newCustomStaff, job_type: parseInt(v) })}
                              >
                                <SelectTrigger data-testid={`select-week-${config.weekNumber}-custom-staff-job-type`}>
                                  <SelectValue placeholder="Job Type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {JOB_TYPES.map((jt) => (
                                    <SelectItem key={jt.value} value={jt.value.toString()}>
                                      {jt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={newCustomStaff.group_id?.toString() || ""}
                                onValueChange={(v) => setNewCustomStaff({ ...newCustomStaff, group_id: parseInt(v) })}
                              >
                                <SelectTrigger data-testid={`select-week-${config.weekNumber}-custom-staff-group`}>
                                  <SelectValue placeholder="Group" />
                                </SelectTrigger>
                                <SelectContent>
                                  {groupOptions.map((g) => (
                                    <SelectItem key={g.value} value={g.value}>
                                      {g.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button onClick={handleAddCustomStaff} data-testid={`button-week-${config.weekNumber}-add-custom-staff`}>
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                              </Button>
                            </div>
                            {config.staffToAdd.length > 0 && (
                              <div className="mt-2 border rounded p-2 space-y-1">
                                {config.staffToAdd.map((staff) => (
                                  <div key={staff.staff_id} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                                    <span>
                                      {staff.staff_name} ({JOB_TYPES.find(jt => jt.value === staff.job_type)?.label || "Unknown"}, Group {staff.group_id})
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveCustomStaff(staff.staff_id)}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {selectedSessionId && (
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex-1 sm:flex-none"
                    data-testid="button-generate"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {isGenerating ? "Generating..." : "Generate Assignments"}
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
                    <TabsTrigger value="table" data-testid="tab-table">
                      <FileText className="h-4 w-4 mr-2" />
                      Table Preview
                    </TabsTrigger>
                    <TabsTrigger value="logs" data-testid="tab-logs">
                      <ScrollText className="h-4 w-4 mr-2" />
                      Logs
                      {isGenerating && (
                        <span className="ml-2 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="summary" className="space-y-4">
                    {assignmentResults.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="border rounded-lg p-4 text-center">
                            <p className="text-3xl font-bold">{assignmentResults.length}</p>
                            <p className="text-sm text-muted-foreground">Total Assignments</p>
                          </div>
                          <div className="border rounded-lg p-4 text-center">
                            <p className="text-3xl font-bold">{weekConfigs.length}</p>
                            <p className="text-sm text-muted-foreground">Weeks</p>
                          </div>
                          <div className="border rounded-lg p-4 text-center">
                            <p className="text-3xl font-bold">
                              {Array.from(new Set(assignmentResults.map(r => r.staff_id))).length}
                            </p>
                            <p className="text-sm text-muted-foreground">Staff Assigned</p>
                          </div>
                          <div className="border rounded-lg p-4 text-center">
                            <p className="text-3xl font-bold">
                              {Array.from(new Set(assignmentResults.map(r => r.lunch_job_id))).length}
                            </p>
                            <p className="text-sm text-muted-foreground">Jobs Covered</p>
                          </div>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium mb-3">Assignments by Day</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {DAYS.map(day => {
                              const count = assignmentResults.filter(r => r.day === day).length;
                              return (
                                <div key={day} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                  <span className="capitalize text-sm">{day}</span>
                                  <Badge variant="secondary">{count}</Badge>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Job Target Overview - Collapsible */}
                        <Collapsible open={targetStaffOpen} onOpenChange={setTargetStaffOpen}>
                          <div className="border rounded-lg p-4">
                            <CollapsibleTrigger asChild>
                              <button className="flex items-center justify-between w-full text-left">
                                <div>
                                  <h4 className="font-medium">Target Staff per Job</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Normal staff assigned per day for each job
                                  </p>
                                </div>
                                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${targetStaffOpen ? 'rotate-180' : ''}`} />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                                {Object.entries(jobDayStats.byJob)
                                  .sort((a, b) => a[0].localeCompare(b[0]))
                                  .map(([jobName, stats]) => (
                                    <div key={jobName} className="flex items-center gap-1 text-sm">
                                      <span className="text-muted-foreground">{jobName}:</span>
                                      <Badge variant="outline">
                                        {stats.normalStaff !== null ? stats.normalStaff : '-'}
                                      </Badge>
                                    </div>
                                  ))}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>

                        {/* Staffing Variations - Days that differ from target */}
                        {(() => {
                          // Build variations comparing each week/day to target (not average)
                          // Exclude Tie Dye jobs from variations
                          const variations: Array<{
                            jobName: string;
                            week: number;
                            day: string;
                            count: number;
                            target: number;
                            type: 'above' | 'below';
                          }> = [];
                          
                          for (const [jobName, stats] of Object.entries(jobDayStats.byJob)) {
                            // Skip Tie Dye jobs
                            if (jobName.toLowerCase().includes('tie dye')) continue;
                            if (stats.normalStaff === null) continue;
                            
                            for (const [weekDayKey, count] of Object.entries(stats.byWeekDay)) {
                              const [weekStr, day] = weekDayKey.split('-');
                              const week = parseInt(weekStr);
                              
                              if (count > stats.normalStaff) {
                                variations.push({ jobName, week, day, count, target: stats.normalStaff, type: 'above' });
                              } else if (count < stats.normalStaff) {
                                variations.push({ jobName, week, day, count, target: stats.normalStaff, type: 'below' });
                              }
                            }
                          }
                          
                          // Check if there are any below-target variations
                          const hasBelowTarget = variations.some(v => v.type === 'below');
                          
                          // Filter based on selection
                          const filteredVariations = variationFilter === 'below' 
                            ? variations.filter(v => v.type === 'below')
                            : variations;
                          
                          // Sort by week, then day, then job name
                          filteredVariations.sort((a, b) => {
                            if (a.week !== b.week) return a.week - b.week;
                            const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday'];
                            if (dayOrder.indexOf(a.day) !== dayOrder.indexOf(b.day)) {
                              return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
                            }
                            return a.jobName.localeCompare(b.jobName);
                          });
                          
                          return (
                            <div className={`border rounded-lg p-4 ${hasBelowTarget ? 'border-amber-500/50 bg-amber-500/5' : 'border-green-500/50 bg-green-500/5'}`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  {hasBelowTarget ? (
                                    <div className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">!</span>
                                    </div>
                                  ) : (
                                    <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  )}
                                  <div>
                                    <h4 className="font-medium">Staffing Variations</h4>
                                    <p className="text-xs text-muted-foreground">
                                      Days where staffing differs from the target
                                    </p>
                                  </div>
                                </div>
                                <Select value={variationFilter} onValueChange={(v) => setVariationFilter(v as 'below' | 'all')}>
                                  <SelectTrigger className="w-[160px]" data-testid="select-variation-filter">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="below">Below Target</SelectItem>
                                    <SelectItem value="all">All Variations</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {filteredVariations.length === 0 ? (
                                <p className={`text-sm ${hasBelowTarget ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                                  {variationFilter === 'below' 
                                    ? 'No jobs are below target staffing levels.'
                                    : 'No variations found. All days match the target staffing levels.'}
                                </p>
                              ) : (
                                <div className="space-y-2 max-h-64 overflow-auto">
                                  {filteredVariations.map((v, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm">
                                      <Badge 
                                        variant="outline" 
                                        className={v.type === 'above' 
                                          ? 'border-yellow-500 text-yellow-700 dark:text-yellow-400' 
                                          : 'border-blue-500 text-blue-700 dark:text-blue-400'}
                                      >
                                        Wk{v.week} {v.day.charAt(0).toUpperCase()}{v.day.slice(1, 3)}
                                      </Badge>
                                      <span className="text-muted-foreground">
                                        {v.jobName}: <strong>{v.count}</strong> 
                                        {v.type === 'above' ? ' ↑' : ' ↓'} (target: {v.target})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {variationFilter === 'all' && (
                                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400 h-4 px-1">↑</Badge>
                                    Above target
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-400 h-4 px-1">↓</Badge>
                                    Below target
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Group Coverage Validation - Combined (no working & all working checks) */}
                        {validationResult?.groupCoverage && (
                          <div className={`border rounded-lg p-4 ${validationResult.groupCoverage.passed ? 'border-green-500/50 bg-green-500/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              {validationResult.groupCoverage.passed ? (
                                <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">!</span>
                                </div>
                              )}
                              <h4 className="font-medium">Group Coverage Validation</h4>
                            </div>
                            <p className={`text-sm ${validationResult.groupCoverage.passed ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                              {validationResult.groupCoverage.message}
                            </p>
                            {!validationResult.groupCoverage.passed && (
                              <div className="mt-3 pt-3 border-t border-amber-500/30 space-y-3">
                                {validationResult.groupCoverage.noWorkingIssues.length > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      Groups with no staff working:
                                    </p>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                      {validationResult.groupCoverage.noWorkingIssues.slice(0, 15).map((issue, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400">
                                          Week {issue.week} • {issue.day} • Group {issue.group_id}
                                        </Badge>
                                      ))}
                                      {validationResult.groupCoverage.noWorkingIssues.length > 15 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{validationResult.groupCoverage.noWorkingIssues.length - 15} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {validationResult.groupCoverage.allWorkingIssues.length > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      Groups with all staff working (no one staying back):
                                    </p>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                      {validationResult.groupCoverage.allWorkingIssues.slice(0, 15).map((issue, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400">
                                          Week {issue.week} • {issue.day} • Group {issue.group_id} ({issue.assigned}/{issue.total})
                                        </Badge>
                                      ))}
                                      {validationResult.groupCoverage.allWorkingIssues.length > 15 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{validationResult.groupCoverage.allWorkingIssues.length - 15} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="focus:ring-2 focus:ring-[#E63946] focus:ring-offset-1 focus:border-[#E63946]"
                            onClick={() => {
                              const headers = ["week", "day", "job_name", "job_code", "staff_name", "staff_id"];
                              const csvContent = [
                                headers.join(","),
                                ...assignmentResults.map(row =>
                                  headers.map(h => {
                                    const value = row[h as keyof AssignmentResult];
                                    return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
                                  }).join(",")
                                )
                              ].join("\n");

                              const blob = new Blob([csvContent], { type: "text/csv" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `lunch_jobs_session_${selectedSessionId}.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            data-testid="button-download-csv"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Output CSV
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="focus:ring-2 focus:ring-[#E63946] focus:ring-offset-1 focus:border-[#E63946]"
                            onClick={handleDownloadConfig}
                            data-testid="button-download-config-bottom"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Config
                          </Button>
                          <Button
                            size="sm"
                            className="bg-[#47c8f5] hover:bg-[#3bb8e5] text-white focus:ring-2 focus:ring-[#E63946] focus:ring-offset-1"
                            onClick={() => {
                              const url = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEETS_ID || "1WFWFo55mfQlyto-SBnAcFOqUIt_kyvaHdpcjamBzXb4"}/edit#gid=2068869187`;
                              window.open(url, "_blank");
                            }}
                            data-testid="button-view-sheets-bottom"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Google Sheet
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-4">
                        {/* Show validation even when no assignments */}
                        {validationResult?.groupCoverage && (
                          <div className={`border rounded-lg p-4 ${validationResult.groupCoverage.passed ? 'border-green-500/50 bg-green-500/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              {validationResult.groupCoverage.passed ? (
                                <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">!</span>
                                </div>
                              )}
                              <h4 className="font-medium">Group Coverage Validation</h4>
                            </div>
                            <p className={`text-sm ${validationResult.groupCoverage.passed ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                              {validationResult.groupCoverage.message}
                            </p>
                            {!validationResult.groupCoverage.passed && (
                              <div className="mt-3 pt-3 border-t border-amber-500/30 space-y-3">
                                {validationResult.groupCoverage.noWorkingIssues.length > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      Groups with no staff working:
                                    </p>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                      {validationResult.groupCoverage.noWorkingIssues.slice(0, 15).map((issue, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400">
                                          Week {issue.week} • {issue.day} • Group {issue.group_id}
                                        </Badge>
                                      ))}
                                      {validationResult.groupCoverage.noWorkingIssues.length > 15 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{validationResult.groupCoverage.noWorkingIssues.length - 15} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {validationResult.groupCoverage.allWorkingIssues.length > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      Groups with all staff working (no one staying back):
                                    </p>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                      {validationResult.groupCoverage.allWorkingIssues.slice(0, 15).map((issue, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400">
                                          Week {issue.week} • {issue.day} • Group {issue.group_id} ({issue.assigned}/{issue.total})
                                        </Badge>
                                      ))}
                                      {validationResult.groupCoverage.allWorkingIssues.length > 15 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{validationResult.groupCoverage.allWorkingIssues.length - 15} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="text-center py-8 text-muted-foreground">
                          No assignments generated yet. Click "Generate Assignments" to start.
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="table">
                    {assignmentResults.length > 0 ? (
                      <>
                        <div className="border rounded-lg overflow-auto max-h-96">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Week</TableHead>
                                <TableHead>Day</TableHead>
                                <TableHead>Job</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Staff</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {assignmentResults.slice(0, 100).map((result, index) => (
                                <TableRow key={index}>
                                  <TableCell>{result.week || 1}</TableCell>
                                  <TableCell className="capitalize">{result.day}</TableCell>
                                  <TableCell>{result.job_name}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{result.job_code}</Badge>
                                  </TableCell>
                                  <TableCell>{result.staff_name}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {assignmentResults.length > 100 && (
                          <p className="text-sm text-muted-foreground mt-2 text-center">
                            Showing 100 of {assignmentResults.length} results
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No assignments to display
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="logs">
                    <LogViewer
                      logs={logStream.logs}
                      onClear={logStream.clearLogs}
                      isStreaming={isGenerating}
                      maxHeight="400px"
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!selectedSessionId && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a session to get started</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
