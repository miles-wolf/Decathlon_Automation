import { ArrowLeft, Play, Download, Save, FileSpreadsheet, Plus, X, ExternalLink, Copy, Users, Calendar, Settings, FileText, BarChart3, ScrollText, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [activeWeek, setActiveWeek] = useState(1);
  const [configTab, setConfigTab] = useState<string>("full-session");
  const [sessionDefaults, setSessionDefaults] = useState<SessionDefaults>(createDefaultSessionDefaults());
  const [weekConfigs, setWeekConfigs] = useState<WeekConfig[]>([createDefaultWeekConfig(1)]);
  const [assignmentResults, setAssignmentResults] = useState<AssignmentResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputTab, setOutputTab] = useState<string>("summary");
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

  const handleAddWeek = () => {
    const newWeekNumber = weekConfigs.length + 1;
    setWeekConfigs([...weekConfigs, createDefaultWeekConfig(newWeekNumber)]);
    setActiveWeek(newWeekNumber);
  };

  const handleRemoveWeek = (weekNumber: number) => {
    if (weekConfigs.length <= 1) return;
    const newConfigs = weekConfigs
      .filter(w => w.weekNumber !== weekNumber)
      .map((w, i) => ({ ...w, weekNumber: i + 1 }));
    setWeekConfigs(newConfigs);
    if (activeWeek > newConfigs.length) {
      setActiveWeek(newConfigs.length);
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
    allStaffAssignments.forEach((sections, staffId) => {
      if (sections.length > 1) {
        duplicates.push({ staffId, sections });
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

  // Download JSON config
  const handleDownloadConfig = () => {
    const configs = weekConfigs.map(generateJsonConfig);
    const blob = new Blob([JSON.stringify(configs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lunchjob_config_session_${selectedSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Configuration JSON downloaded",
    });
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
      if (data.results && Array.isArray(data.results)) {
        setAssignmentResults(data.results);
        logStream.success(`Generated ${data.results.length} assignments successfully`);
        
        // Log summary by week
        const byWeek = data.results.reduce((acc: Record<number, number>, r: AssignmentResult) => {
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
                Lunchtime Job Assigner
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
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Session Selection
              </CardTitle>
              <CardDescription>
                Select a camp session to load eligible staff
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
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
                      {jobsLoading ? "..." : `${lunchJobs.length} jobs`}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Configuration with Full Session and Weeks tabs */}
          {selectedSessionId && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Configuration
                    </CardTitle>
                    <CardDescription>
                      Set session-wide defaults or customize individual weeks
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={configTab} onValueChange={setConfigTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="full-session" data-testid="tab-full-session">
                      <Calendar className="h-4 w-4 mr-2" />
                      Full Session
                    </TabsTrigger>
                    <TabsTrigger value="weeks" data-testid="tab-weeks">
                      <FileText className="h-4 w-4 mr-2" />
                      Individual Weeks
                    </TabsTrigger>
                  </TabsList>

                  {/* Full Session Tab */}
                  <TabsContent value="full-session" className="space-y-6">
                    <div className="bg-muted/50 rounded-lg p-4 mb-4">
                      <p className="text-sm text-muted-foreground">
                        Settings configured here apply to all weeks by default. You can override these settings for specific weeks in the Individual Weeks tab.
                      </p>
                    </div>

                    {/* Hardcoded Assignments Section */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Hardcoded Job Assignments</h3>
                      <p className="text-sm text-muted-foreground">
                        These staff members will be assigned to their jobs for all days of all weeks
                      </p>

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
                          <Label className="text-base">Custom Job Assignments</Label>
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
                    </div>

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

                  {/* Individual Weeks Tab */}
                  <TabsContent value="weeks" className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-muted-foreground">
                        Override session defaults for specific weeks. Weeks use session defaults unless customized here.
                      </p>
                      <Button variant="outline" size="sm" onClick={handleAddWeek} data-testid="button-add-week">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Week
                      </Button>
                    </div>

                    <Tabs value={`week-${activeWeek}`} onValueChange={(v) => setActiveWeek(parseInt(v.replace("week-", "")))}>
                  <TabsList className="mb-4 flex-wrap">
                    {weekConfigs.map((config) => (
                      <TabsTrigger key={config.weekNumber} value={`week-${config.weekNumber}`} data-testid={`tab-week-${config.weekNumber}`}>
                        Week {config.weekNumber}
                        {weekConfigs.length > 1 && (
                          <button
                            className="ml-2 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveWeek(config.weekNumber);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {weekConfigs.map((config) => (
                    <TabsContent key={config.weekNumber} value={`week-${config.weekNumber}`} className="space-y-6">
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

                      {/* Hardcoded Assignments Section */}
                      <div className="space-y-4 border rounded-lg p-4">
                        <h4 className="font-medium">Hardcoded Job Assignments</h4>
                        <p className="text-xs text-muted-foreground">
                          Staff assigned here will be given these jobs for all days this week.
                        </p>

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

                        {/* Custom Job Assignments */}
                        <div className="border rounded-lg p-3 space-y-2">
                          <div>
                            <Label className="text-sm">Custom Job Assignments</Label>
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
                      </div>

                      {/* Collapsible Advanced Options */}
                      <div className="space-y-3 pt-4 border-t">
                        <p className="text-sm font-medium text-muted-foreground">Advanced Options</p>
                        
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
                  </TabsContent>
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
                  <Button
                    variant="outline"
                    onClick={handleDownloadConfig}
                    data-testid="button-download-config"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Config
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

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
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
                            Download CSV
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No assignments generated yet. Click "Generate Assignments" to start.
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
