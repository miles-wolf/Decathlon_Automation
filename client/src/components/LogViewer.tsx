import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Download, Filter, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug" | "success";
  message: string;
  details?: string;
}

interface LogViewerProps {
  logs: LogEntry[];
  onClear?: () => void;
  onRefresh?: () => void;
  isStreaming?: boolean;
  maxHeight?: string;
  showControls?: boolean;
}

const levelColors: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  warn: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  error: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  debug: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30",
  success: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
};

const levelLabels: Record<string, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
  success: "OK",
};

export function LogViewer({
  logs,
  onClear,
  onRefresh,
  isStreaming = false,
  maxHeight = "400px",
  showControls = true,
}: LogViewerProps) {
  const [enabledLevels, setEnabledLevels] = useState<Set<string>>(
    new Set(["info", "warn", "error", "success"])
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLogs = logs.filter((log) => enabledLevels.has(log.level));

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const toggleLevel = (level: string) => {
    const newLevels = new Set(enabledLevels);
    if (newLevels.has(level)) {
      newLevels.delete(level);
    } else {
      newLevels.add(level);
    }
    setEnabledLevels(newLevels);
  };

  const handleDownload = () => {
    const content = logs
      .map(
        (log) =>
          `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.message}${
            log.details ? "\n  " + log.details : ""
          }`
      )
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  return (
    <div className="flex flex-col border rounded-lg bg-muted/30">
      {showControls && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            {isStreaming && (
              <Badge variant="outline" className="gap-1 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Live
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {filteredLogs.length} {filteredLogs.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-filter-logs">
                  <Filter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.keys(levelColors).map((level) => (
                  <DropdownMenuCheckboxItem
                    key={level}
                    checked={enabledLevels.has(level)}
                    onCheckedChange={() => toggleLevel(level)}
                  >
                    <span className={`inline-flex items-center gap-2`}>
                      <Badge variant="outline" className={`${levelColors[level]} text-xs px-1.5`}>
                        {levelLabels[level]}
                      </Badge>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                data-testid="button-refresh-logs"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              data-testid="button-download-logs"
            >
              <Download className="h-4 w-4" />
            </Button>
            {onClear && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClear}
                data-testid="button-clear-logs"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
      <ScrollArea
        ref={scrollRef}
        className="font-mono text-sm"
        style={{ maxHeight }}
      >
        <div className="p-3 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No logs to display
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex gap-2 py-1 hover:bg-muted/50 rounded px-1"
              >
                <span className="text-muted-foreground shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <Badge
                  variant="outline"
                  className={`${levelColors[log.level]} text-xs px-1.5 shrink-0`}
                >
                  {levelLabels[log.level]}
                </Badge>
                <span className="break-all">
                  {log.message}
                  {log.details && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {log.details}
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const idCounter = useRef(0);

  const addLog = (
    level: LogEntry["level"],
    message: string,
    details?: string
  ) => {
    const id = `log-${Date.now()}-${idCounter.current++}`;
    setLogs((prev) => [
      ...prev,
      {
        id,
        timestamp: new Date(),
        level,
        message,
        details,
      },
    ]);
  };

  const clearLogs = () => setLogs([]);

  const info = (message: string, details?: string) => addLog("info", message, details);
  const warn = (message: string, details?: string) => addLog("warn", message, details);
  const error = (message: string, details?: string) => addLog("error", message, details);
  const debug = (message: string, details?: string) => addLog("debug", message, details);
  const success = (message: string, details?: string) => addLog("success", message, details);

  return {
    logs,
    addLog,
    clearLogs,
    info,
    warn,
    error,
    debug,
    success,
  };
}
