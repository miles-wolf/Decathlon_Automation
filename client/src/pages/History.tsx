import { ArrowLeft, History as HistoryIcon, Clock, CheckCircle, XCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { AssignmentRun } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function History() {
  const { data: runs = [], isLoading, refetch } = useQuery<AssignmentRun[]>({
    queryKey: ["/api/assignment-runs"],
  });

  const formatSessionDisplay = (sessionId: number) => {
    if (sessionId === 1012) return "Session 1 - 2025";
    if (sessionId === 1015) return "Session 2 - 2025";
    return `Session ${sessionId}`;
  };

  const formatDate = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary" className="gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Running
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

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
                Assignment History
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View past assignment runs and their results
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HistoryIcon className="h-5 w-5" />
                Recent Runs
              </CardTitle>
              <CardDescription>
                History of assignment script executions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading history...
                </div>
              ) : runs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No assignment runs yet</p>
                  <p className="text-sm mt-1">
                    Run assignments from the Lunchtime or AM/PM Jobs tools to see history here
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Week</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Results</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(run.executedAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {run.runType}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatSessionDisplay(run.sessionId)}</TableCell>
                          <TableCell>{run.weekNumber || "-"}</TableCell>
                          <TableCell>{getStatusBadge(run.status)}</TableCell>
                          <TableCell>{run.resultCount ?? "-"}</TableCell>
                          <TableCell>
                            {run.googleSheetsUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(run.googleSheetsUrl!, "_blank")}
                                data-testid={`button-sheets-${run.id}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
