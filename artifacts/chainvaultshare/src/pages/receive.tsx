import { useState, useEffect } from "react";
import { useVerifyTransfer, useGetTransferFiles, getGetTransferFilesQueryKey } from "@workspace/api-client-react";
import {
  ShieldCheck, ShieldAlert, Loader2, FileText,
  FolderOpen, Files, Download, Copy, ChevronDown, ChevronUp, Clock,
  Lock, KeyRound, CheckCircle2, Eye, EyeOff, Radio,
} from "lucide-react";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { VerificationResult } from "@workspace/api-client-react";
import { getKeyFromFragment, downloadAndDecrypt } from "@/lib/crypto";

function ItemIcon({ type }: { type: string }) {
  if (type === "folder") return <FolderOpen className="w-4 h-4" />;
  if (type === "multiple") return <Files className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function formatExpiry(expiresAt: string): { label: string; urgent: boolean } {
  const exp = new Date(expiresAt);
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 1) return { label: `Expires in ${diffDays} days`, urgent: false };
  if (diffDays === 1) return { label: "Expires in 1 day", urgent: true };
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours > 0) return { label: `Expires in ${diffHours} hours`, urgent: true };
  return { label: "Expires very soon", urgent: true };
}

export default function Receive() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialCode = searchParams.get("code") ?? "";

  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const verifyTransfer = useVerifyTransfer();
  const { toast } = useToast();

  // Passphrase unlock state
  const [passphraseRequired, setPassphraseRequired] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState("");

  // Delivery receipt state (one per file download)
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [decryptStage, setDecryptStage] = useState<Record<string, "downloading" | "decrypting" | "done">>({});

  // E2E: check if key is in URL fragment
  const e2eKey = getKeyFromFragment();

  const transferId = result?.verified && result.transfer ? result.transfer.id : undefined;
  const transferData = result?.verified && result.transfer ? (result.transfer as any) : null;
  const isE2eEncrypted = transferData?.e2eEncrypted === true;

  const { data: files, isLoading: filesLoading } = useGetTransferFiles(
    transferId as string,
    {
      query: { enabled: !!transferId, queryKey: getGetTransferFilesQueryKey(transferId as string) },
      request: { headers: { "X-Access-Code": code } }
    }
  );

  const handleLookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = code.trim();
    if (!q) return;
    setResult(null);
    setPassphraseRequired(false);
    setDownloadToken(null);
    setUnlockError("");
    setReceipts({});
    try {
      const res = await verifyTransfer.mutateAsync({ data: { query: q } });
      setResult(res);
      setShowAdvanced(false);
      // Check if passphrase required
      if ((res as any).transfer?.passphraseRequired) {
        setPassphraseRequired(true);
      }
    } catch {
      setResult({ verified: false, message: "Service unavailable. Please try again." });
    }
  };

  useEffect(() => {
    if (initialCode) handleLookup();
  }, [initialCode]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  // Unlock passphrase → get download token
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim() || !transferId) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch(`/api/transfers/${transferId}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      const data = await res.json();
      if (res.ok && data.downloadToken) {
        setDownloadToken(data.downloadToken);
        setPassphraseRequired(false);
        toast({ title: "🔓 Unlocked", description: "You can now download the files." });
      } else {
        setUnlockError(data.error ?? "Incorrect passphrase.");
      }
    } catch {
      setUnlockError("Could not reach server. Try again.");
    } finally {
      setUnlocking(false);
    }
  };

  // Download a file and capture delivery receipt
  const downloadFile = async (objectPath: string, fileName: string, fileId?: string) => {
    // Replace the private /objects/ prefix with the public /public-objects/ prefix
    const publicPath = objectPath.replace(/^\/objects\//, "/public-objects/");
    const url = `/api/storage${publicPath}`;
    const headers: Record<string, string> = {
      "X-Access-Code": code
    };
    if (downloadToken) headers["X-Download-Token"] = downloadToken;

    // E2E decryption path
    if (isE2eEncrypted && e2eKey) {
      const key = fileId ?? fileName;
      setDownloadingFile(key);
      setDecryptStage((prev) => ({ ...prev, [key]: "downloading" }));
      try {
        await downloadAndDecrypt(url, fileName, e2eKey, headers, (stage) => {
          setDecryptStage((prev) => ({ ...prev, [key]: stage }));
        });
        // Try to capture receipt
        const headRes = await fetch(url, { method: "HEAD", headers }).catch(() => null);
        const receipt = headRes?.headers?.get("X-Delivery-Receipt");
        if (receipt && fileId) setReceipts((prev) => ({ ...prev, [fileId]: receipt }));
      } catch (err: any) {
        if (err?.status === 503) {
          toast({
            variant: "destructive",
            title: "Uploader is offline",
            description: "Peer-to-peer transfers require the uploader to keep their page open.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Download or Decryption failed",
            description: err?.message || "Missing or invalid decryption key.",
          });
        }
      } finally {
        setDownloadingFile(null);
      }
      return;
    }

    // Standard download path — intercept via fetch to get receipt header
    try {
      const key = fileId ?? fileName;
      setDownloadingFile(key);
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 401 && body.requiresPassphrase) {
          setPassphraseRequired(true);
          toast({ variant: "destructive", title: "Passphrase required", description: "Enter the passphrase to download." });
          return;
        }
        if (response.status === 503) {
          toast({
            variant: "destructive",
            title: "Uploader is offline",
            description: body.error || "Peer-to-peer transfers require the uploader to keep their page open.",
          });
          return;
        }
        toast({ variant: "destructive", title: "Download failed", description: body.error ?? "Unknown error" });
        return;
      }

      const receipt = response.headers.get("X-Delivery-Receipt");
      if (receipt && fileId) setReceipts((prev) => ({ ...prev, [fileId]: receipt }));

      const blob = await response.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(objUrl);

      if (receipt) {
        toast({ title: "📋 Delivery receipt issued", description: "Receipt saved — copy it from the file list." });
      }
    } catch {
      toast({ variant: "destructive", title: "Download error", description: "Please try again." });
    } finally {
      setDownloadingFile(null);
    }
  };

  const isExpired = result && (result as any).expired === true;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10 mt-6">
        <div className="w-18 h-18 rounded-3xl liquid-glass border border-cyan-400/30 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(0,240,255,0.25)] hover:scale-105 transition-all">
          <Download className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3 text-glow">Receive a transfer</h1>
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed tracking-wide max-w-xl mx-auto">
          Enter an access code or share link to download files directly.
        </p>
      </div>

      <div className="rounded-3xl mb-10 overflow-hidden liquid-glass shadow-2xl p-2 border border-white/15">
        <form onSubmit={handleLookup} className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. CVT-4291"
            className="flex-1 bg-transparent px-6 py-4 text-lg md:text-xl text-foreground placeholder:text-muted-foreground/40 outline-none font-mono tracking-widest uppercase font-bold"
            data-testid="input-receive-code"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={verifyTransfer.isPending}
            data-testid="button-receive-submit"
            className="liquid-button px-8 md:px-10 py-4 rounded-2xl text-sm md:text-base font-black tracking-widest uppercase !text-white text-white shrink-0 font-mono shadow-lg"
          >
            {verifyTransfer.isPending ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : "Access"}
          </button>
        </form>
      </div>
      {/* Passphrase Unlock Modal */}
      {passphraseRequired && result?.verified && (
        <div className="mb-8 rounded-2xl border-2 overflow-hidden"
          style={{ background: "rgba(16,18,32,0.9)", borderColor: "rgba(52,211,153,0.4)", backdropFilter: "blur(20px)" }}>
          {/* Vault animation header */}
          <div className="px-6.5 py-6 border-b flex items-center gap-3.5"
            style={{ borderColor: "rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.05)" }}>
            <div className="relative">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.4)" }}>
                <Lock className="w-5.5 h-5.5" style={{ color: "#34d399" }} />
              </div>
              <div className="absolute -inset-1 rounded-xl animate-ping"
                style={{ background: "rgba(52,211,153,0.08)" }} />
            </div>
            <div>
              <p className="text-base font-extrabold" style={{ color: "#34d399" }}>This transfer is passphrase protected</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(148,163,184,0.7)" }}>
                Enter the passphrase to unlock and access files
              </p>
            </div>
          </div>
          <form onSubmit={handleUnlock} className="px-6.5 py-6">
            <div className="relative mb-4.5">
              <input
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter passphrase…"
                autoFocus
                className="w-full pl-5 pr-12 py-3.5 rounded-xl text-base outline-none font-mono"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: `1px solid ${unlockError ? "rgba(239,68,68,0.4)" : "rgba(52,211,153,0.3)"}`,
                  color: "white",
                }}
              />
              <button type="button" onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                {showPassphrase ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
            {unlockError && (
              <p className="text-sm text-red-400 mb-3.5 flex items-center gap-1.5 font-medium">
                <ShieldAlert className="w-4 h-4" /> {unlockError}
              </p>
            )}
            <button type="submit" disabled={unlocking || !passphrase.trim()}
              className="w-full py-3.5 rounded-xl text-base font-extrabold tracking-widest uppercase transition-all"
              style={{
                background: unlocking ? "rgba(52,211,153,0.1)" : "rgba(52,211,153,0.2)",
                border: "1px solid rgba(52,211,153,0.4)",
                color: "#34d399",
                opacity: unlocking || !passphrase.trim() ? 0.6 : 1,
              }}>
              {unlocking ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4.5 h-4.5 animate-spin" /> Unlocking vault…</span> : "Unlock Vault"}
            </button>
          </form>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-400">
          {/* Expired */}
          {isExpired ? (
            <div className="rounded border border-amber-500/20 bg-card/60 backdrop-blur-sm">
              <div className="flex items-center gap-3 px-5 py-4 bg-amber-500/5">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Clock className="w-3 h-3 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-400 tracking-wide">Transfer expired</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Code <span className="font-mono">{code}</span> was valid for 7 days but has now expired. Ask the sender to create a new transfer.
                  </p>
                </div>
              </div>
            </div>

          ) : result.verified && result.transfer ? (
            <div className="rounded overflow-hidden glass-widget">

              {/* Verified banner */}
              <div className="flex items-center gap-4.5 px-6.5 py-5 bg-accent/5 border-b border-accent/15">
                <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-sm font-bold text-accent tracking-wide">Transfer found — ready to download</p>
                    {result.transfer.isP2p && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase border bg-primary/10 text-primary border-primary/25 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30 animate-pulse">
                        <Radio className="w-3 h-3" />
                        Direct P2P Relay
                      </span>
                    )}
                    {isE2eEncrypted && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase border ${
                        e2eKey 
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse-subtle"
                      }`}>
                        <KeyRound className="w-3 h-3" />
                        {e2eKey ? "Decryption Active" : "Key Missing"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Public · anyone with this code can access these files</p>
                </div>
                {result.transfer.expiresAt && (() => {
                  const { label, urgent } = formatExpiry(result.transfer.expiresAt!);
                  return (
                    <span className={`text-xs font-bold shrink-0 flex items-center gap-1.5 ${urgent ? "text-amber-400" : "text-muted-foreground"}`}>
                      <Clock className="w-3.5 h-3.5" />
                      {label}
                    </span>
                  );
                })()}
              </div>

              <div className="px-6.5 py-6 space-y-5">
                {/* Transfer info */}
                <div className="flex items-center gap-4.5 p-5 rounded bg-muted/20 border border-border/20">
                  <div className="w-12 h-12 rounded border border-border/20 bg-muted/30 flex items-center justify-center text-muted-foreground shrink-0">
                    <ItemIcon type={result.transfer.itemType} />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Access code</p>
                    <p className="text-2xl font-mono font-black text-primary tracking-widest">{result.transfer.proofId}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {formatBytes(result.transfer.totalSize)} · {result.transfer.fileCount} file{result.transfer.fileCount !== 1 ? "s" : ""} · shared {formatRelativeTime(result.transfer.createdAt)}
                    </p>
                  </div>
                </div>

                {result.transfer.isP2p && (
                  <div className="p-4 rounded-xl flex items-start gap-3 border bg-primary/10 border-primary/25 dark:bg-cyan-500/10 dark:border-cyan-500/25">
                    <Radio className="w-4 h-4 text-primary dark:text-cyan-400 shrink-0 mt-0.5 animate-pulse" />
                    <p className="text-xs text-foreground/90 dark:text-cyan-200/85 leading-relaxed">
                      <strong>Peer-to-Peer Real-Time Stream:</strong> This transfer is streamed live from the sender's browser session. Keep this tab open while downloading.
                    </p>
                  </div>
                )}

                {/* Files list */}
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Files</p>
                    {files && files.length > 0 && (
                      <p className="text-xs text-muted-foreground font-medium">{files.length} file{files.length !== 1 ? "s" : ""} · {formatBytes(files.reduce((a, f) => a + f.size, 0))}</p>
                    )}
                  </div>

                  {/* Files can only be downloaded if not passphrase-locked OR if token obtained */}
                  {passphraseRequired && !downloadToken ? (
                    <div className="py-8 text-center">
                      <Lock className="w-7 h-7 mx-auto mb-3" style={{ color: "#34d399" }} />
                      <p className="text-sm font-medium" style={{ color: "rgba(148,163,184,0.7)" }}>Enter the passphrase above to access files</p>
                    </div>
                  ) : filesLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-14 rounded bg-muted/20 animate-pulse border border-border/10" />
                      ))}
                    </div>
                  ) : files && files.length > 0 ? (
                    <div className="space-y-3">
                      {files.map((file) => {
                        const fileIdStr = String(file.id);
                        const isDownloading = downloadingFile === fileIdStr;
                        const stage = decryptStage[fileIdStr];
                        const receipt = receipts[fileIdStr];
                        return (
                          <div key={file.id}
                            className="flex flex-col gap-3.5 p-4 rounded border border-border/20 bg-muted/10 hover:bg-muted/20 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-foreground truncate">{file.name}</p>
                                  <p className="text-xs text-muted-foreground/75 font-mono mt-0.5">{formatBytes(file.size)}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => downloadFile(file.objectPath, file.name, fileIdStr)}
                                disabled={isDownloading}
                                className="flex items-center gap-2 px-4.5 py-2.5 rounded text-sm font-extrabold shrink-0 transition-all hover:opacity-80 disabled:opacity-40 bg-primary/10 border border-primary/30 text-primary"
                              >
                                {isDownloading ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" />
                                    {stage === "decrypting" ? "Decrypting…" : "Downloading…"}</>
                                ) : (
                                  <><Download className="w-4 h-4" /> Download</>
                                )}
                              </button>
                            </div>

                            {/* Delivery receipt display */}
                            {receipt && (
                              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
                                <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" style={{ color: "#818cf8" }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#818cf8" }}>
                                    Delivery Receipt
                                  </p>
                                  <p className="text-xs font-mono truncate" style={{ color: "rgba(148,163,184,0.7)" }}>
                                    {receipt}
                                  </p>
                                </div>
                                <button onClick={() => copy(receipt)}
                                  className="shrink-0 p-1.5 rounded hover:bg-white/5 transition-colors">
                                  <Copy className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-6 text-center">No files attached yet.</p>
                  )}
                </div>

                {/* Advanced toggle */}
                <div className="border-t border-border/20 pt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {showAdvanced ? "Hide" : "Show"} blockchain proof
                  </button>
                  {showAdvanced && (
                    <div className="mt-4 space-y-3">
                      {[
                        { label: "Proof ID", value: result.transfer.proofId },
                        { label: "Proof Hash", value: result.transfer.proofHash ?? "pending" },
                        { label: "Storage Ref", value: result.transfer.storageRef ?? "pending" },
                        { label: "Network", value: result.transfer.networkName ?? "Ethereum Mainnet" },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-start justify-between gap-4 px-4 py-3 rounded bg-muted/10 border border-border/10">
                          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider shrink-0 pt-0.5">{label}</span>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono text-foreground/70 truncate">{value}</span>
                            {value !== "pending" && (
                              <button onClick={() => copy(value)} className="shrink-0 hover:text-primary transition-colors">
                                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          ) : (
            /* Not found */
            <div className="rounded border border-border/20 bg-card/60 backdrop-blur-sm">
              <div className="flex items-center gap-3 px-5 py-4 bg-muted/5">
                <div className="w-6 h-6 rounded-full bg-destructive/20 border border-destructive/30 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-3 h-3 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-destructive tracking-wide">Transfer not found</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {result.message ?? "No transfer matches this code. Check for typos or ask the sender for a new code."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
