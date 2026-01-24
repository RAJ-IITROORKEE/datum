"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { indianStates, getCitiesByState } from "@/lib/indian-states-cities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Search, ArrowUpDown, RefreshCw, Upload, Copy, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Survey {
  id: string;
  firmsName: string;
  founderPrincipal: string;
  yearOfEstablishment: number | null;
  websiteLink: string | null;
  officeAddress: string;
  contactNumber: string;
  state: string;
  city: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  firmsName: string;
  founderPrincipal: string;
  yearOfEstablishment: string;
  websiteLink: string;
  officeAddress: string;
  contactNumber: string;
  state: string;
  city: string;
  email: string;
  customState?: string;
  customCity?: string;
}

// Bulk Upload Component Props
interface BulkUploadContentProps {
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  uploadStatus: "idle" | "validating" | "validated" | "uploading" | "success" | "error";
  setUploadStatus: (status: "idle" | "validating" | "validated" | "uploading" | "success" | "error") => void;
  uploadProgress: number;
  setUploadProgress: (progress: number) => void;
  uploadErrors: string[];
  setUploadErrors: (errors: string[]) => void;
  validatedData: Record<string, string>[];
  setValidatedData: (data: Record<string, string>[]) => void;
  fetchSurveys: () => void;
  setIsBulkUploadOpen: (open: boolean) => void;
}

// Bulk Upload Component
const BulkUploadContent: React.FC<BulkUploadContentProps> = ({
  uploadFile,
  setUploadFile,
  uploadStatus,
  setUploadStatus,
  uploadProgress,
  setUploadProgress,
  uploadErrors,
  setUploadErrors,
  validatedData,
  setValidatedData,
  fetchSurveys,
  setIsBulkUploadOpen,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const csvTemplate = `firmsName,founderPrincipal,yearOfEstablishment,websiteLink,officeAddress,contactNumber,state,city,email
ABC Architects,John Doe,2010,https://abc.com,"123 Main St, City",9876543210,Maharashtra,Mumbai,contact@abc.com
XYZ Design Studio,Jane Smith,2015,https://xyz.com,"456 Park Ave, City",9876543211,Karnataka,Bengaluru,info@xyz.com`;

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(csvTemplate);
    toast.success("Template copied to clipboard!");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      if (validTypes.includes(file.type) || file.name.endsWith(".csv") || file.name.endsWith(".xlsx")) {
        setUploadFile(file);
        setUploadStatus("idle");
        setUploadErrors([]);
      } else {
        toast.error("Please upload a CSV or XLSX file");
      }
    }
  };

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim());
    const data: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      if (values.length === headers.length) {
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }
    return data;
  };

  const validateFile = async () => {
    if (!uploadFile) {
      toast.error("Please select a file");
      return;
    }

    setUploadStatus("validating");
    setUploadErrors([]);

    try {
      let parsedData: Record<string, string>[] = [];

      if (uploadFile.name.endsWith(".csv")) {
        const text = await uploadFile.text();
        parsedData = parseCSV(text);
      } else if (uploadFile.name.endsWith(".xlsx")) {
        toast.error("XLSX support coming soon. Please use CSV format.");
        setUploadStatus("error");
        return;
      }

      if (parsedData.length === 0) {
        setUploadErrors(["No valid data found in file"]);
        setUploadStatus("error");
        return;
      }

      const errors: string[] = [];
      const requiredFields = [
        "firmsName",
        "founderPrincipal",
        "officeAddress",
        "contactNumber",
        "state",
        "city",
        "email",
      ];

      parsedData.forEach((row, index) => {
        const rowNumber = index + 2;
        requiredFields.forEach(field => {
          if (!row[field] || row[field].trim() === "") {
            errors.push(`Row ${rowNumber}: Missing required field "${field}"`);
          }
        });

        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          errors.push(`Row ${rowNumber}: Invalid email format`);
        }

        if (row.websiteLink && row.websiteLink.trim() !== "") {
          try {
            new URL(row.websiteLink);
          } catch {
            errors.push(`Row ${rowNumber}: Invalid website URL`);
          }
        }
      });

      if (errors.length > 0) {
        setUploadErrors(errors);
        setUploadStatus("error");
        return;
      }

      setValidatedData(parsedData);
      setUploadStatus("validated");
      toast.success(`File validated successfully! ${parsedData.length} entries ready to upload.`);
    } catch (error) {
      console.error("Validation error:", error);
      setUploadErrors(["Error validating file. Please check the format."]);
      setUploadStatus("error");
    }
  };

  const handleBulkUpload = async () => {
    if (validatedData.length === 0) return;

    setUploadStatus("uploading");
    setUploadProgress(0);

    try {
      const total = validatedData.length;
      let completed = 0;
      const errors: string[] = [];

      for (const row of validatedData) {
        try {
          const response = await fetch("/api/admin/admin-survey", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(row),
          });

          if (!response.ok) {
            const data = await response.json();
            errors.push(`Failed to upload ${row.firmsName}: ${data.error || "Unknown error"}`);
          }

          completed++;
          setUploadProgress(Math.round((completed / total) * 100));
        } catch (error) {
          errors.push(`Error uploading ${row.firmsName}: ${error}`);
        }
      }

      if (errors.length > 0) {
        setUploadErrors(errors);
        setUploadStatus("error");
        toast.error(`Upload completed with ${errors.length} error(s)`);
      } else {
        setUploadStatus("success");
        toast.success(`Successfully uploaded ${total} entries!`);
        setTimeout(() => {
          setIsBulkUploadOpen(false);
          fetchSurveys();
        }, 2000);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("error");
      setUploadErrors(["Unexpected error during upload"]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h3 className="font-semibold">File Format Instructions</h3>
            <p className="text-sm text-muted-foreground">
              Your CSV file should contain the following columns in this exact order:
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyTemplate} className="shrink-0">
            <Copy className="h-4 w-4 mr-2" />
            Copy Template
          </Button>
        </div>

        <div className="bg-muted p-4 rounded-lg">
          <code className="text-xs block overflow-x-auto whitespace-pre">{csvTemplate}</code>
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">Required fields:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>firmsName, founderPrincipal, officeAddress, contactNumber, state, city, email</li>
          </ul>
          <p className="font-medium mt-2">Optional: yearOfEstablishment, websiteLink</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="border-2 border-dashed rounded-lg p-6 text-center">
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={handleFileChange} className="hidden" />
          {uploadFile ? (
            <div className="space-y-2">
              <p className="font-medium">{uploadFile.name}</p>
              <p className="text-sm text-muted-foreground">{(uploadFile.size / 1024).toFixed(2)} KB</p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Choose Different File
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload CSV file</p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Select File
              </Button>
            </div>
          )}
        </div>

        {uploadFile && uploadStatus === "idle" && (
          <Button onClick={validateFile} className="w-full">Validate File</Button>
        )}

        {uploadStatus === "validating" && (
          <div className="flex items-center justify-center gap-2 py-4">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <p>Validating file...</p>
          </div>
        )}

        {uploadStatus === "validated" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <p className="font-medium">{validatedData.length} entries ready</p>
            </div>
            <Button onClick={handleBulkUpload} className="w-full">Upload to Database</Button>
          </div>
        )}

        {uploadStatus === "uploading" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {uploadStatus === "success" && (
          <div className="flex items-center gap-2 text-green-600 justify-center py-4">
            <CheckCircle className="h-6 w-6" />
            <p className="font-medium">Upload completed successfully!</p>
          </div>
        )}

        {uploadStatus === "error" && uploadErrors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p className="font-medium">Errors found:</p>
            </div>
            <div className="bg-destructive/10 p-4 rounded-lg max-h-60 overflow-y-auto">
              <ul className="text-sm space-y-1 text-destructive">
                {uploadErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
            <Button variant="outline" onClick={() => { setUploadStatus("idle"); setUploadErrors([]); }} className="w-full">
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// Zod validation schema
const surveySchema = z.object({
  firmsName: z.string().min(2, "Firm name must be at least 2 characters"),
  founderPrincipal: z.string().min(2, "Founder name must be at least 2 characters"),
  yearOfEstablishment: z.string().optional(),
  websiteLink: z.string().url("Invalid URL").optional().or(z.literal("")),
  officeAddress: z.string().min(5, "Address must be at least 5 characters"),
  contactNumber: z.string().min(10, "Contact number must be at least 10 digits"),
  state: z.string().min(1, "State is required"),
  city: z.string().min(1, "City is required"),
  email: z.string().email("Invalid email address"),
  customState: z.string().optional(),
  customCity: z.string().optional(),
});

const AdminSurveyPage = () => {
  const [filteredSurveys, setFilteredSurveys] = useState<Survey[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "validating" | "validated" | "uploading" | "success" | "error">("idle");
  const [validatedData, setValidatedData] = useState<Record<string, string>[]>([]);

  const [formData, setFormData] = useState<FormData>({
    firmsName: "",
    founderPrincipal: "",
    yearOfEstablishment: "",
    websiteLink: "",
    officeAddress: "",
    contactNumber: "",
    state: "",
    city: "",
    email: "",
    customState: "",
    customCity: "",
  });

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        search: searchTerm,
        state: stateFilter,
        city: cityFilter,
        sortBy,
        sortOrder,
      });

      const response = await fetch(`/api/admin/admin-survey?${params}`);
      const data = await response.json();

      if (response.ok) {
        setFilteredSurveys(data.surveys);
        setTotalPages(data.pagination.totalPages);
        setStates(data.filters.states);
        setCities(data.filters.cities);
      } else {
        toast.error(data.error || "Failed to fetch surveys");
      }
    } catch (error) {
      toast.error("Error fetching surveys");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, stateFilter, cityFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchSurveys();
  }, [page, searchTerm, stateFilter, cityFilter, sortBy, sortOrder, fetchSurveys]);

  // Update available cities when state changes
  useEffect(() => {
    if (formData.state && formData.state !== "Other") {
      const cities = getCitiesByState(formData.state);
      setAvailableCities(cities);
      // Reset city if it's not in the new state's cities
      if (formData.city && formData.city !== "Other" && !cities.includes(formData.city)) {
        setFormData(prev => ({ ...prev, city: "" }));
      }
    } else {
      setAvailableCities([]);
    }
  }, [formData.state, formData.city]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      // Prepare data with custom values if "Other" is selected
      const submitData = {
        ...formData,
        state: formData.state === "Other" ? (formData.customState || "") : formData.state,
        city: formData.city === "Other" ? (formData.customCity || "") : formData.city,
      };

      // Validate with Zod
      const validatedData = surveySchema.parse(submitData);

      const url = editingSurvey
        ? `/api/admin/admin-survey/${editingSurvey.id}`
        : "/api/admin/admin-survey";

      const method = editingSurvey ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validatedData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          editingSurvey
            ? "Survey updated successfully"
            : "Survey created successfully"
        );
        setIsDialogOpen(false);
        resetForm();
        fetchSurveys();
      } else {
        toast.error(data.error || "Failed to save survey");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        toast.error("Please fix the validation errors");
      } else {
        toast.error("Error saving survey");
        console.error(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this survey?")) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/admin-survey/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Survey deleted successfully");
        fetchSurveys();
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to delete survey");
      }
    } catch (error) {
      toast.error("Error deleting survey");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (survey: Survey) => {
    setEditingSurvey(survey);
    setFormData({
      firmsName: survey.firmsName,
      founderPrincipal: survey.founderPrincipal,
      yearOfEstablishment: survey.yearOfEstablishment?.toString() || "",
      websiteLink: survey.websiteLink || "",
      officeAddress: survey.officeAddress,
      contactNumber: survey.contactNumber,
      state: survey.state,
      city: survey.city,
      email: survey.email,
      customState: "",
      customCity: "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      firmsName: "",
      founderPrincipal: "",
      yearOfEstablishment: "",
      websiteLink: "",
      officeAddress: "",
      contactNumber: "",
      state: "",
      city: "",
      email: "",
      customState: "",
      customCity: "",
    });
    setErrors({});
    setEditingSurvey(null);
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Survey</h1>
          <p className="text-muted-foreground">
            Manage architectural firms details
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setLoading(true);
              fetchSurveys();
            }}
            disabled={loading}
            title="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={() => {
                setUploadStatus("idle");
                setUploadFile(null);
                setUploadErrors([]);
                setValidatedData([]);
              }}>
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl">Bulk Upload Survey Data</DialogTitle>
                <DialogDescription>
                  Upload CSV or XLSX file to add multiple survey entries at once
                </DialogDescription>
              </DialogHeader>
              <BulkUploadContent
                uploadFile={uploadFile}
                setUploadFile={setUploadFile}
                uploadStatus={uploadStatus}
                setUploadStatus={setUploadStatus}
                uploadProgress={uploadProgress}
                setUploadProgress={setUploadProgress}
                uploadErrors={uploadErrors}
                setUploadErrors={setUploadErrors}
                validatedData={validatedData}
                setValidatedData={setValidatedData}
                fetchSurveys={fetchSurveys}
                setIsBulkUploadOpen={setIsBulkUploadOpen}
              />
            </DialogContent>
          </Dialog>

          {/* Add Entry Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                {editingSurvey ? "Edit Survey Entry" : "Add New Survey Entry"}
              </DialogTitle>
              <DialogDescription>
                Enter the architectural firm details below. Fields marked with * are required.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Firm Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Firm Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firmsName">
                      Firm Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="firmsName"
                      placeholder="Enter firm name"
                      value={formData.firmsName}
                      onChange={(e) =>
                        setFormData({ ...formData, firmsName: e.target.value })
                      }
                      className={errors.firmsName ? "border-destructive" : ""}
                    />
                    {errors.firmsName && (
                      <p className="text-sm text-destructive">{errors.firmsName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="founderPrincipal">
                      Founder/Principal Architect <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="founderPrincipal"
                      placeholder="Enter founder/principal name"
                      value={formData.founderPrincipal}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          founderPrincipal: e.target.value,
                        })
                      }
                      className={errors.founderPrincipal ? "border-destructive" : ""}
                    />
                    {errors.founderPrincipal && (
                      <p className="text-sm text-destructive">{errors.founderPrincipal}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yearOfEstablishment">Year of Establishment</Label>
                    <Input
                      id="yearOfEstablishment"
                      type="number"
                      placeholder="e.g., 2010"
                      min="1900"
                      max={new Date().getFullYear()}
                      value={formData.yearOfEstablishment}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          yearOfEstablishment: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="websiteLink">Website</Label>
                    <Input
                      id="websiteLink"
                      type="url"
                      placeholder="https://example.com"
                      value={formData.websiteLink}
                      onChange={(e) =>
                        setFormData({ ...formData, websiteLink: e.target.value })
                      }
                      className={errors.websiteLink ? "border-destructive" : ""}
                    />
                    {errors.websiteLink && (
                      <p className="text-sm text-destructive">{errors.websiteLink}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Location Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Location</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="state">
                      State <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.state}
                      onValueChange={(value) => {
                        setFormData({ ...formData, state: value, city: "" });
                      }}
                    >
                      <SelectTrigger className={errors.state ? "border-destructive" : ""}>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {indianStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.state && (
                      <p className="text-sm text-destructive">{errors.state}</p>
                    )}
                  </div>

                  {formData.state === "Other" && (
                    <div className="space-y-2">
                      <Label htmlFor="customState">
                        Custom State <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="customState"
                        placeholder="Enter state name"
                        value={formData.customState}
                        onChange={(e) =>
                          setFormData({ ...formData, customState: e.target.value })
                        }
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="city">
                      City <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.city}
                      onValueChange={(value) => {
                        setFormData({ ...formData, city: value });
                      }}
                      disabled={!formData.state || formData.state === "Other"}
                    >
                      <SelectTrigger className={errors.city ? "border-destructive" : ""}>
                        <SelectValue placeholder={formData.state ? "Select city" : "Select state first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCities.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.city && (
                      <p className="text-sm text-destructive">{errors.city}</p>
                    )}
                  </div>

                  {formData.city === "Other" && (
                    <div className="space-y-2">
                      <Label htmlFor="customCity">
                        Custom City <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="customCity"
                        placeholder="Enter city name"
                        value={formData.customCity}
                        onChange={(e) =>
                          setFormData({ ...formData, customCity: e.target.value })
                        }
                      />
                    </div>
                  )}

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="officeAddress">
                      Office Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="officeAddress"
                      placeholder="Enter complete office address"
                      value={formData.officeAddress}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          officeAddress: e.target.value,
                        })
                      }
                      className={errors.officeAddress ? "border-destructive" : ""}
                    />
                    {errors.officeAddress && (
                      <p className="text-sm text-destructive">{errors.officeAddress}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactNumber">
                      Contact Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="contactNumber"
                      placeholder="+91 1234567890"
                      value={formData.contactNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contactNumber: e.target.value,
                        })
                      }
                      className={errors.contactNumber ? "border-destructive" : ""}
                    />
                    {errors.contactNumber && (
                      <p className="text-sm text-destructive">{errors.contactNumber}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="contact@firm.com"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className={errors.email ? "border-destructive" : ""}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : (editingSurvey ? "Update Entry" : "Create Entry")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter survey entries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search firms..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stateFilter">State</Label>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cityFilter">City</Label>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setStateFilter("");
                  setCityFilter("");
                  setPage(1);
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firm Name</TableHead>
                  <TableHead>Founder/Principal</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("yearOfEstablishment")}>
                    <div className="flex items-center gap-1">
                      Year
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("state")}>
                    <div className="flex items-center gap-1">
                      State
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("city")}>
                    <div className="flex items-center gap-1">
                      City
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredSurveys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      No surveys found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSurveys.map((survey) => (
                    <TableRow key={survey.id}>
                      <TableCell className="font-medium">
                        {survey.firmsName}
                      </TableCell>
                      <TableCell>{survey.founderPrincipal}</TableCell>
                      <TableCell>
                        {survey.yearOfEstablishment || "N/A"}
                      </TableCell>
                      <TableCell>{survey.state}</TableCell>
                      <TableCell>{survey.city}</TableCell>
                      <TableCell>{survey.contactNumber}</TableCell>
                      <TableCell>{survey.email}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(survey)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(survey.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPage(page - 1)}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages || loading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminSurveyPage;
