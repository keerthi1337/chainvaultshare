import { useState } from "react";
import { useListTransfers, getListTransfersQueryKey, useGetStats, useDeleteTransfer, useUpdateTransferExpiration } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Copy, ShieldCheck, Trash2, Search, Loader2, FileText, FolderOpen, Files, Clock, X, Download, Ghost, Lock, Radio, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBytes } from "@/lib/utils";
import { getMyTransferIds, getOwnerToken, removeMyTransfer } from "@/lib/my-transfers";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";

function ItemIcon({ type }: { type: string }) {
  if (type === "folder") return <FolderOpen className="w-3.5 h-3.5" />;
  if (type === "multiple") return <Files className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

function safeFormatDate(val?: string | Date, pattern = "MMM d, yyyy"): string {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return format(d, pattern);
  } catch {
    return "—";
  }
}

export default function Transfers() {
  const { data: allTransfers, isLoading, isError } = useListTransfers();
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const deleteTransfer = useDeleteTransfer();
  const updateExpiration = useUpdateTransferExpiration();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null);
  const [customDays, setCustomDays] = useState(7);
  const [customHours, setCustomHours] = useState(0);
  const [customMinutes, setCustomMinutes] = useState(0);

  // Show active unexpired transfers for this user / IP
  const validTransfers = Array.isArray(allTransfers) ? allTransfers : [];
  const transfers = validTransfers.filter((t) => {
    if (!t) return false;
    try {
      return t.expiresAt ? new Date(t.expiresAt).getTime() > Date.now() : true;
    } catch {
      return true;
    }
  });

  const myStats = {
    total: transfers.length,
    verified: transfers.filter((t) => t?.status === "verified").length,
    totalDownloads: transfers.reduce((a, t) => a + (Number((t as any)?.downloadCount) || 0), 0),
    bytes: transfers.reduce((a, t) => a + (Number(t?.totalSize) || 0), 0),
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  const del = async (id: string) => {
    const ownerToken = getOwnerToken(id);
    if (!ownerToken) {
      toast({ variant: "destructive", title: "Cannot delete", description: "Owner token not found for this transfer." });
      return;
    }
    try {
      await deleteTransfer.mutateAsync({ id });
      removeMyTransfer(id);
      queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
      toast({ title: "Transfer deleted" });
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    }
  };

  const statCards = [
    { label: "My transfers", value: isLoading ? null : myStats.total },
    { label: "Verified", value: isLoading ? null : myStats.verified, accent: true },
    { label: "Total downloads", value: isLoading ? null : myStats.totalDownloads },
    { label: "Data transferred", value: isLoading ? null : formatBytes(myStats.bytes) },
  ];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 mt-5">
        <h1 className="text-4xl font-black tracking-tight text-glow">Recent transfers</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, accent }) => (
          <div
            key={label}
            className="liquid-glass-card rounded-3xl px-6 py-5 border border-white/12 shadow-xl"
          >
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-1.5 font-semibold">{label}</p>
            <p className={`text-3xl md:text-4xl font-black font-mono text-glow ${accent ? "text-accent" : "text-foreground"}`}>
              {value === null ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="liquid-glass rounded-3xl overflow-hidden shadow-2xl border border-white/12">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <p className="text-xs text-foreground uppercase tracking-widest font-black">Your Transfers</p>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Active & Encrypted</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.01]">
                {["Transfer", "Date", "Expires", "Downloads", "Status", ""].map((h) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-left text-[10px] text-muted-foreground uppercase tracking-widest font-bold ${h === "" ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    <span className="text-[10px] tracking-widest uppercase">Loading transfers...</span>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    <p className="text-[11px] font-bold text-amber-400 mb-1">Backend Server Disconnected</p>
                    <p className="text-[10px] text-muted-foreground/70 max-w-md mx-auto leading-relaxed">
                      Unable to reach the backend API server. If deploying, please check server logs. Active transfers will appear here once connected.
                    </p>
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    <p className="text-[10px] tracking-widest uppercase mb-1">No transfers yet</p>
                    <p className="text-[10px] text-muted-foreground/50">Transfers you send will stay here until they expire.</p>
                  </td>
                </tr>
              ) : (
                transfers.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border/10 hover:bg-muted/10 transition-colors"
                    data-testid={`row-transfer-${t.id}`}
                  >
                    {/* Transfer info */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                          t.ghostMode
                            ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
                            : (t as any).hasPassphrase
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-border/20 bg-muted/20 text-muted-foreground"
                        }`}>
                          {t.ghostMode ? (
                            <Ghost className="w-4 h-4" />
                          ) : (t as any).hasPassphrase ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <ItemIcon type={t.itemType} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => copy(t.proofId)}
                              className="font-mono text-sm font-bold text-primary hover:text-primary/70 transition-colors flex items-center gap-1"
                              title="Copy access code"
                              data-testid={`button-copy-code-${t.id}`}
                            >
                              {t.proofId}
                              <Copy className="w-3 h-3 opacity-60" />
                            </button>
                            {t.ghostMode && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-500/20 text-purple-400 uppercase tracking-wider">
                                <Ghost className="w-2.5 h-2.5" />
                                Ghost
                              </span>
                            )}
                            {(t as any).hasPassphrase && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">
                                <Lock className="w-2.5 h-2.5" />
                                Passcode Locked
                              </span>
                            )}
                            {t.e2eEncrypted && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-500/20 text-indigo-400 uppercase tracking-wider">
                                <KeyRound className="w-2.5 h-2.5" />
                                Zero-Knowledge
                              </span>
                            )}
                            {t.isP2p && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border border-primary/25 bg-primary/10 text-primary dark:border-transparent dark:bg-cyan-500/20 dark:text-cyan-400 uppercase tracking-wider">
                                <Radio className="w-2.5 h-2.5" />
                                P2P Relay
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-foreground font-medium mt-0.5">
                            {t.ghostMode
                              ? "Ghost transfer"
                              : (t as any).hasPassphrase
                              ? "Passphrase Protected"
                              : t.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {t.ghostMode
                              ? "Zero logs · No trace"
                              : (t as any).hasPassphrase
                              ? "Protected · Passcode required to download"
                              : `${t.fileCount} item${t.fileCount !== 1 ? "s" : ""} · ${formatBytes(t.totalSize)}`}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap font-mono text-xs">
                      {safeFormatDate(t.createdAt)}
                    </td>

                    {/* Expires */}
                    <td className="px-5 py-4 whitespace-nowrap text-xs font-mono">
                      <button
                        onClick={() => {
                          setSelectedTransfer(t);
                          const expTime = t.expiresAt ? new Date(t.expiresAt).getTime() : Date.now() + 7 * 86400000;
                          const msLeft = Math.max(0, expTime - Date.now());
                          const hoursLeft = Math.max(0, Math.ceil(msLeft / (60 * 60 * 1000)));
                          setCustomDays(Math.floor(hoursLeft / 24));
                          setCustomHours(hoursLeft % 24);
                          setShowExpiryModal(true);
                        }}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/40 bg-muted/10 hover:bg-primary/10 hover:border-primary/45 text-xs text-foreground font-mono transition-all duration-250 shadow-sm"
                        title="Click to modify expiration"
                      >
                        <Clock className="w-3.5 h-3.5 text-primary animate-pulse-subtle" />
                        {safeFormatDate(t.expiresAt)}
                      </button>
                    </td>

                    {/* Downloads */}
                    <td className="px-5 py-4 whitespace-nowrap text-xs font-mono">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
                        <Download className="w-3 h-3" />
                        {(t as any).downloadCount ?? 0}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {t.status === "verified" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase bg-accent/10 text-accent border border-accent/20">
                          <ShieldCheck className="w-3 h-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase bg-muted/30 text-muted-foreground border border-border/20 capitalize">
                          {t.status}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.status === "verified" && (
                          <Link href={`/verify?q=${t.proofId}`}>
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Verify proof"
                              data-testid={`button-verify-${t.id}`}
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          </Link>
                        )}
                        <button
                          onClick={() => copy(t.shareLink)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                          title="Copy link"
                          data-testid={`button-copy-${t.id}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => del(t.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                          data-testid={`button-delete-${t.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expiration Modal */}
      {showExpiryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-xl p-4 md:p-8 animate-in fade-in duration-300">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-xl md:max-w-2xl rounded-2xl p-8 md:p-12 glass-widget relative border-2 border-primary/45 shadow-2xl shadow-primary/20"
          >
            <button
              onClick={() => setShowExpiryModal(false)}
              className="absolute top-6 right-6 text-muted-foreground hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4.5 shadow-lg shadow-primary/10">
                <Clock className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase text-glow">Modify Expiration Timer</h3>
              <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                Update how long this transfer remains active on the blockchain.
              </p>
            </div>

            {/* Custom Days, Hours, and Minutes Input Fields */}
            <div className="space-y-6">
              <div className="flex gap-6">
                <div className="flex-1">
                  <label className="text-xs md:text-sm text-muted-foreground uppercase font-black tracking-widest block mb-2 text-center">Days</label>
                  <input
                    type="number"
                    min="0"
                    value={customDays}
                    onChange={(e) => setCustomDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-muted/15 border border-border/20 rounded-xl px-5 py-4 text-2xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs md:text-sm text-muted-foreground uppercase font-black tracking-widest block mb-2 text-center">Hours</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={customHours}
                    onChange={(e) => setCustomHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                    className="w-full bg-muted/15 border border-border/20 rounded-xl px-5 py-4 text-2xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs md:text-sm text-muted-foreground uppercase font-black tracking-widest block mb-2 text-center">Minutes</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                    className="w-full bg-muted/15 border border-border/20 rounded-xl px-5 py-4 text-2xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground/60 text-center font-medium leading-relaxed">
                Enter any custom duration. Set to at least 1 minute for immediate short-term shares.
              </p>
            </div>

            {/* Save / Apply Expiration */}
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={async () => {
                  const totalMins = (customDays * 24 + customHours) * 60 + customMinutes;
                  if (totalMins <= 0) {
                    toast({ variant: "destructive", title: "Invalid duration", description: "Expiration must be at least 1 minute." });
                    return;
                  }

                  if (selectedTransfer) {
                    const newExpiry = new Date(Date.now() + totalMins * 60 * 1000);
                    try {
                      await updateExpiration.mutateAsync({
                        id: selectedTransfer.id,
                        data: { expiresAt: newExpiry.toISOString() },
                      });
                      queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
                      toast({ title: "Expiration timer updated" });
                    } catch (error: any) {
                      toast({ variant: "destructive", title: "Update failed", description: error?.message || "Unknown error occurred" });
                    }
                  }
                  setShowExpiryModal(false);
                }}
                className="px-12 py-4 rounded-xl bg-primary text-primary-foreground text-base font-extrabold uppercase tracking-widest hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
              >
                Apply Expiration
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}