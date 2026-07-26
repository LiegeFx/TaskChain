"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ExternalLink,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  History,
  FileCode2,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  hash: string;
  contract_name: string;
  amount: number;
  asset: string;
  status: "confirmed" | "pending" | "failed";
  date: string;
  explorer_url: string;
}

interface Stats {
  totalTransactions: number;
  totalVolume: number;
  confirmedCount: number;
  pendingCount: number;
  failedCount: number;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        status: statusFilter,
        page: page.toString(),
        limit: "5",
      });

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      setTransactions(data.transactions || []);
      setStats(data.stats || null);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (err) {
      console.error("Failed to load transactions", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatHash = (hash: string) => {
    if (!hash || hash.length < 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <History className="h-8 w-8 text-primary" />
            Transaction History
          </h1>
          <p className="text-muted-foreground mt-2">
            View, search, and verify all on-chain transactions and smart contract executions.
          </p>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Total Volume</p>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <p className="text-3xl font-bold text-foreground">
            ${stats ? stats.totalVolume.toLocaleString() : "0"}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Confirmed Txs</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-emerald-500">
            {stats ? stats.confirmedCount : 0}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Pending Txs</p>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-amber-500">
            {stats ? stats.pendingCount : 0}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Failed Txs</p>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <p className="text-3xl font-bold text-rose-500">
            {stats ? stats.failedCount : 0}
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl bg-card/40 border border-border/40 backdrop-blur-sm">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by transaction hash or contract name..."
            className="pl-9 bg-background/60"
          />
        </div>

        <div className="w-full sm:w-48">
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="bg-background/60">
              <SelectValue placeholder="Status Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data Table / Cards */}
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm">Fetching transaction history...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <History className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="font-semibold text-lg">No Transactions Found</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              No blockchain transactions match your search query or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-4">Transaction Hash</th>
                  <th className="px-6 py-4">Contract Name</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Explorer Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    {/* Hash */}
                    <td className="px-6 py-4 font-mono font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{formatHash(tx.hash)}</span>
                        <button
                          onClick={() => handleCopy(tx.hash)}
                          className="p-1 text-muted-foreground hover:text-foreground rounded-md transition"
                          title="Copy full hash"
                        >
                          {copiedHash === tx.hash ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Contract Name */}
                    <td className="px-6 py-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        <FileCode2 className="h-3.5 w-3.5" />
                        {tx.contract_name}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-6 py-4 font-semibold text-foreground">
                      ${tx.amount.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{tx.asset}</span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {tx.status === "confirmed" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirmed
                        </span>
                      )}
                      {tx.status === "pending" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <Clock className="h-3.5 w-3.5 animate-pulse" />
                          Pending
                        </span>
                      )}
                      {tx.status === "failed" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                          <XCircle className="h-3.5 w-3.5" />
                          Failed
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>

                    {/* Explorer Link */}
                    <td className="px-6 py-4 text-right">
                      <a
                        href={tx.explorer_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                      >
                        Explorer
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && transactions.length > 0 && (
          <div className="px-6 py-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              Showing {transactions.length} of {totalCount} transaction(s)
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 px-2.5"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="font-medium text-foreground px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 px-2.5"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
