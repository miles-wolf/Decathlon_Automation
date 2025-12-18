import { ArrowLeft, Upload, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ListData {
  data: any[];
  count: number;
  uploadedAt?: string;
}

export default function UploadLists() {
  const [staffFile, setStaffFile] = useState<File | null>(null);
  const [lunchtimeFile, setLunchtimeFile] = useState<File | null>(null);
  const [ampmFile, setAmpmFile] = useState<File | null>(null);
  const { toast } = useToast();

  // Fetch uploaded lists
  const { data: staffList } = useQuery<ListData>({
    queryKey: ["/api/lists/staff"],
  });

  const { data: lunchtimeList } = useQuery<ListData>({
    queryKey: ["/api/lists/lunchtime_jobs"],
  });

  const { data: ampmList } = useQuery<ListData>({
    queryKey: ["/api/lists/ampm_jobs"],
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, listType }: { file: File; listType: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("listType", listType);

      const response = await fetch("/api/upload-list", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message,
      });
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/lists/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists/lunchtime_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists/ampm_jobs"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpload = (file: File | null, listType: string) => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate({ file, listType });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">File Manager</h1>
            <p className="text-muted-foreground">Upload CSV or Excel files for staff and job lists</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Staff List Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Staff List</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file with staff names. Expected columns: firstName, lastName
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="staff-file">Select File</Label>
                  <Input
                    id="staff-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => setStaffFile(e.target.files?.[0] || null)}
                    data-testid="input-staff-file"
                  />
                </div>
                <Button
                  onClick={() => handleUpload(staffFile, "staff")}
                  disabled={!staffFile || uploadMutation.isPending}
                  data-testid="button-upload-staff"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </div>
              {staffList && staffList.count > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" data-testid="badge-staff-count">
                      {staffList.count} staff members
                    </Badge>
                    {staffList.uploadedAt && (
                      <span className="text-sm text-muted-foreground">
                        Uploaded {new Date(staffList.uploadedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>First Name</TableHead>
                          <TableHead>Last Name</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staffList.data.slice(0, 10).map((staff, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{staff['Staff First Name'] || staff.firstName || staff.first_name || staff.FirstName || ''}</TableCell>
                            <TableCell>{staff['Staff Last Name'] || staff.lastName || staff.last_name || staff.LastName || ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {staffList.count > 10 && (
                      <div className="text-center py-2 text-sm text-muted-foreground border-t">
                        + {staffList.count - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lunchtime Jobs Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Lunchtime Jobs List</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file with lunchtime jobs. Expected columns: code, name
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="lunchtime-file">Select File</Label>
                  <Input
                    id="lunchtime-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => setLunchtimeFile(e.target.files?.[0] || null)}
                    data-testid="input-lunchtime-file"
                  />
                </div>
                <Button
                  onClick={() => handleUpload(lunchtimeFile, "lunchtime_jobs")}
                  disabled={!lunchtimeFile || uploadMutation.isPending}
                  data-testid="button-upload-lunchtime"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </div>
              {lunchtimeList && lunchtimeList.count > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" data-testid="badge-lunchtime-count">
                      {lunchtimeList.count} jobs
                    </Badge>
                    {lunchtimeList.uploadedAt && (
                      <span className="text-sm text-muted-foreground">
                        Uploaded {new Date(lunchtimeList.uploadedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lunchtimeList.data.slice(0, 10).map((job, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{job['Job Code'] || job.code || job.Code || ''}</TableCell>
                            <TableCell>{job['Job Name'] || job.name || job.Name || ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {lunchtimeList.count > 10 && (
                      <div className="text-center py-2 text-sm text-muted-foreground border-t">
                        + {lunchtimeList.count - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AM/PM Jobs Upload */}
          <Card>
            <CardHeader>
              <CardTitle>AM/PM Jobs List</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file with AM/PM jobs. Expected columns: code, name, type (am or pm)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="ampm-file">Select File</Label>
                  <Input
                    id="ampm-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => setAmpmFile(e.target.files?.[0] || null)}
                    data-testid="input-ampm-file"
                  />
                </div>
                <Button
                  onClick={() => handleUpload(ampmFile, "ampm_jobs")}
                  disabled={!ampmFile || uploadMutation.isPending}
                  data-testid="button-upload-ampm"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </div>
              {ampmList && ampmList.count > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" data-testid="badge-ampm-count">
                      {ampmList.count} jobs
                    </Badge>
                    {ampmList.uploadedAt && (
                      <span className="text-sm text-muted-foreground">
                        Uploaded {new Date(ampmList.uploadedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ampmList.data.slice(0, 10).map((job, idx) => {
                          const jobName = job.Job || job.job || job.name || job.Name || '';
                          const code = job.code || job.Code || jobName.toUpperCase().replace(/\s+/g, '_').substring(0, 20);
                          const type = job.type || job.Type || (jobName.toLowerCase().startsWith('pm ') ? 'pm' : 'pm');
                          return (
                            <TableRow key={idx}>
                              <TableCell>{code}</TableCell>
                              <TableCell>{jobName}</TableCell>
                              <TableCell>{type.toUpperCase()}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {ampmList.count > 10 && (
                      <div className="text-center py-2 text-sm text-muted-foreground border-t">
                        + {ampmList.count - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
