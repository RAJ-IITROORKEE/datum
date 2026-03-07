"use client";

// ============================================================
//  Admin — Contact-Us Management  (Datum)
//  Full threading + email-reply + status management
// ============================================================

import { useEffect, useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  Calendar,
  Eye,
  Trash2,
  MessageSquare,
  CheckCircle,
  Clock,
  ArrowUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Send,
  RefreshCw,
  MessagesSquare,
  MailCheck,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────
type ContactStatus = "PENDING" | "RESOLVED" | "DELETED";
type ConversationType = "NEW_INQUIRY" | "ADMIN_REPLY" | "USER_REPLY";

interface Contact {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactStatus;
  threadId: string | null;
  parentId: string | null;
  conversationType: ConversationType;
  createdAt: string;
  updatedAt: string;
}

interface ThreadMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  conversationType: ConversationType;
  createdAt: string;
}

// ── Helper Components ─────────────────────────────────────────
function StatusBadge({ status }: { status: ContactStatus }) {
  if (status === "RESOLVED")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
        <CheckCircle className="h-3 w-3 mr-1" />
        Resolved
      </Badge>
    );
  if (status === "DELETED")
    return (
      <Badge variant="destructive">
        <Trash2 className="h-3 w-3 mr-1" />
        Deleted
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200">
      <Clock className="h-3 w-3 mr-1" />
      Pending
    </Badge>
  );
}

function ConvBadge({ type }: { type: ConversationType }) {
  if (type === "ADMIN_REPLY")
    return (
      <Badge className="bg-[#9ecae1]/40 text-[#1e6fa3] border-[#9ecae1] dark:bg-[#4292c6]/20 dark:text-[#9ecae1] dark:border-[#4292c6]/40 text-xs">
        Admin Reply
      </Badge>
    );
  if (type === "USER_REPLY")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
        User Reply
      </Badge>
    );
  return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 text-xs">
      New Inquiry
    </Badge>
  );
}

function threadBg(type: ConversationType) {
  if (type === "ADMIN_REPLY") return "bg-[#9ecae1]/20 border-[#9ecae1] dark:bg-[#4292c6]/10 dark:border-[#4292c6]/40";
  if (type === "USER_REPLY") return "bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:border-emerald-700";
  return "bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700";
}

// ── Column helper ─────────────────────────────────────────────
const colHelper = createColumnHelper<Contact>();

// ── Main Component ─────────────────────────────────────────────
export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  // View dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // Reply / Status dialog
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusContact, setStatusContact] = useState<Contact | null>(null);
  const [replyText, setReplyText] = useState("");
  const [newStatus, setNewStatus] = useState<ContactStatus>("PENDING");
  const [sendingReply, setSendingReply] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/contact-us");
      const data = await res.json();
      if (res.ok) {
        setContacts(data.data ?? []);
      } else {
        toast.error(data.error || "Failed to fetch contacts");
      }
    } catch {
      toast.error("An error occurred while fetching contacts");
    } finally {
      setIsLoading(false);
    }
  };

  const loadThread = async (threadId: string | null) => {
    if (!threadId) return;
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/contact-us/thread/${threadId}`);
      const data = await res.json();
      if (res.ok) setThreadMessages(data.messages ?? []);
    } catch {
      // non-fatal
    } finally {
      setThreadLoading(false);
    }
  };

  const openView = (contact: Contact) => {
    setViewContact(contact);
    setThreadMessages([]);
    setViewOpen(true);
    loadThread(contact.threadId);
  };

  const openStatusModal = (contact: Contact) => {
    setStatusContact(contact);
    setNewStatus(contact.status === "RESOLVED" ? "PENDING" : "RESOLVED");
    setReplyText("");
    setThreadMessages([]);
    setStatusOpen(true);
    loadThread(contact.threadId);
  };

  const openDelete = (contact: Contact) => {
    setDeleteContact(contact);
    setDeleteOpen(true);
  };

  const handleStatusUpdate = async () => {
    if (!statusContact) return;
    setSendingReply(true);
    try {
      // 1. Update status
      const patchRes = await fetch(`/api/contact-us/${statusContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json();
        toast.error(d.error || "Status update failed");
        return;
      }

      // 2. Optionally send email reply
      if (replyText.trim()) {
        const emailRes = await fetch("/api/contact-us/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: statusContact.id,
            replyMessage: replyText,
          }),
        });
        if (!emailRes.ok) {
          const d = await emailRes.json();
          toast.error(d.error || "Email sending failed");
          return;
        }
        toast.success("Status updated & reply sent via email");
      } else {
        toast.success("Status updated successfully");
      }

      setContacts((prev) =>
        prev.map((c) =>
          c.id === statusContact.id ? { ...c, status: newStatus } : c
        )
      );
      setStatusOpen(false);
    } catch {
      toast.error("Unexpected error occurred");
    } finally {
      setSendingReply(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteContact) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contact-us/${deleteContact.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Contact deleted");
        setContacts((prev) => prev.filter((c) => c.id !== deleteContact.id && c.threadId !== deleteContact.threadId));
        setDeleteOpen(false);
      } else {
        toast.error(data.error || "Delete failed");
      }
    } catch {
      toast.error("Unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

// ── Columns ─────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      colHelper.accessor("name", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ getValue }) => (
          <div className="font-medium">{getValue()}</div>
        ),
      }),
      colHelper.accessor("email", {
        header: "Email",
        cell: ({ getValue }) => (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[160px]">{getValue()}</span>
          </div>
        ),
      }),
      colHelper.accessor("subject", {
        header: "Subject",
        cell: ({ getValue }) => (
          <div className="max-w-[180px] truncate text-sm" title={getValue()}>
            {getValue()}
          </div>
        ),
      }),
      colHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue()} />,
      }),
      colHelper.accessor("conversationType", {
        header: "Type",
        cell: ({ getValue }) => <ConvBadge type={getValue()} />,
      }),
      colHelper.accessor("createdAt", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Date <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(getValue())}
          </span>
        ),
      }),
      colHelper.display({
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const contact = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => openView(contact)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => openStatusModal(contact)}>
                      <MailCheck className="h-4 w-4 text-[#4292c6]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reply / Update Status</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDelete(contact)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete Thread</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts]
  );

  const tableData = useMemo(
    () =>
      showPendingOnly
        ? contacts.filter((c) => c.status === "PENDING")
        : contacts,
    [contacts, showPendingOnly]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const pending = contacts.filter((c) => c.status === "PENDING").length;
  const resolved = contacts.filter((c) => c.status === "RESOLVED").length;
  const thisMonth = contacts.filter((c) => {
    const d = new Date(c.createdAt);
    const n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  }).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact Submissions</h1>
          <p className="text-muted-foreground mt-1">
            Manage, reply, and track all contact inquiries
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchContacts} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contacts.length}</div>
            <p className="text-xs text-muted-foreground">All submissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting reply</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{resolved}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{thisMonth}</div>
            <p className="text-xs text-muted-foreground">New this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>All Contact Submissions</CardTitle>
              <CardDescription className="mt-1">
                {tableData.length} result{tableData.length !== 1 ? "s" : ""}
                {showPendingOnly ? " (pending only)" : ""}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Button
                variant={showPendingOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPendingOnly(!showPendingOnly)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Pending
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4292c6]" />
            </div>
          ) : tableData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessagesSquare className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">
                {showPendingOnly ? "No pending contacts" : "No contacts yet"}
              </p>
              <p className="text-sm">Contact submissions will appear here</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {table.getState().pagination.pageIndex + 1} of{" "}
                  {table.getPageCount()}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── View Dialog ───────────────────────────────────────── */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contact Details</DialogTitle>
            <DialogDescription>Full message details and conversation thread</DialogDescription>
          </DialogHeader>
          {viewContact && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Name</p>
                  <p className="mt-1 font-semibold">{viewContact.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Email</p>
                  <p className="mt-1 font-semibold">{viewContact.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Subject</p>
                  <p className="mt-1">{viewContact.subject}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</p>
                  <div className="mt-1"><StatusBadge status={viewContact.status} /></div>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Message</p>
                <p className="text-sm p-4 bg-muted rounded-md whitespace-pre-wrap text-foreground">{viewContact.message.split("\n\n-------")[0]}</p>
              </div>
              {viewContact.threadId && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2 flex items-center gap-2">
                    <MessagesSquare className="h-3 w-3" /> Thread History
                  </p>
                  {threadLoading ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#4292c6] mx-auto" />
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {[...threadMessages].reverse().map((msg, idx) => {
                        const isAdmin = msg.conversationType === "ADMIN_REPLY";
                        const isUser = msg.conversationType === "USER_REPLY";
                        const dotColor = isAdmin ? "#4292c6" : isUser ? "#10b981" : "#94a3b8";
                        const cleanMsg = msg.message.split("\n\n-------")[0];
                        return (
                          <details key={msg.id} open={idx === 0} className="group">
                            <summary className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer list-none hover:bg-muted/60 transition-colors select-none">
                              <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                              <span className="flex-1 min-w-0 flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">{msg.name}</span>
                                <ConvBadge type={msg.conversationType} />
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">{formatDate(msg.createdAt)}</span>
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180" />
                            </summary>
                            <div className="ml-7 pl-3 pb-3 pt-1 border-l" style={{ borderColor: dotColor + '40' }}>
                              <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{cleanMsg}</p>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <Separator />
              <div className="text-xs text-muted-foreground">Submitted: {formatDate(viewContact.createdAt)}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
            {viewContact && (
              <Button
                className="bg-[#4292c6] hover:bg-[#2d7ab3] text-white"
                onClick={() => { setViewOpen(false); openStatusModal(viewContact); }}
              >
                <Send className="h-4 w-4 mr-2" />
                Reply
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reply / Status Dialog ─────────────────────────────── */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reply & Update Status</DialogTitle>
            <DialogDescription>Send an email reply and/or update the contact status</DialogDescription>
          </DialogHeader>
          {statusContact && (
            <div className="space-y-5">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p>
                  <span className="font-medium">{statusContact.name}</span>{" "}
                  <span className="text-muted-foreground">({statusContact.email})</span>
                </p>
                <p className="mt-1 text-muted-foreground">{statusContact.subject}</p>
              </div>

              {statusContact.threadId && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2 mb-2">
                    <MessagesSquare className="h-3 w-3" /> Conversation History
                  </Label>
                  {threadLoading ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#4292c6] mx-auto" />
                    </div>
                  ) : (
                    <div className="space-y-0.5 max-h-64 overflow-y-auto pr-0.5">
                      {[...threadMessages].reverse().map((msg, idx) => {
                        const isAdmin = msg.conversationType === "ADMIN_REPLY";
                        const isUser = msg.conversationType === "USER_REPLY";
                        const dotColor = isAdmin ? "#4292c6" : isUser ? "#10b981" : "#94a3b8";
                        const cleanMsg = msg.message.split("\n\n-------")[0];
                        return (
                          <details key={msg.id} open={idx === 0} className="group">
                            <summary className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer list-none hover:bg-muted/60 transition-colors select-none">
                              <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-foreground">{msg.name}</span>
                                <ConvBadge type={msg.conversationType} />
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">{formatDate(msg.createdAt)}</span>
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180" />
                            </summary>
                            <div className="ml-7 pl-3 pb-2 pt-1 border-l" style={{ borderColor: dotColor + '40' }}>
                              <p className="text-xs whitespace-pre-wrap text-foreground/90 leading-relaxed">{cleanMsg}</p>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                  <Separator className="mt-3" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Update Status</Label>
                  <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ContactStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <StatusBadge status={newStatus} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Email Reply{" "}
                  <span className="text-muted-foreground font-normal text-xs">
                    (optional — leave blank to only update status)
                  </span>
                </Label>
                <Textarea
                  placeholder={`Hi ${statusContact.name},\n\nThank you for reaching out...`}
                  rows={6}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)} disabled={sendingReply}>
              Cancel
            </Button>
            <Button
              className="bg-[#4292c6] hover:bg-[#2d7ab3] text-white"
              onClick={handleStatusUpdate}
              disabled={sendingReply}
            >
              {sendingReply ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Processing...</>
              ) : replyText.trim() ? (
                <><Send className="h-4 w-4 mr-2" />Update & Send Reply</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-2" />Update Status</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Contact Thread</DialogTitle>
            <DialogDescription>
              This will permanently delete the entire conversation thread. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteContact && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium">{deleteContact.name}</p>
              <p className="text-muted-foreground">{deleteContact.email}</p>
              <p className="mt-1 text-muted-foreground truncate">{deleteContact.subject}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Delete Thread</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
