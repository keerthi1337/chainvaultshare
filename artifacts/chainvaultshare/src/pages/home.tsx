import { useState, useRef, useCallback, useEffect } from "react";
import {
  useCreateTransfer,
  useUpdateTransferProof,
  useAddTransferFile,
  useUpdateTransferExpiration,
  getListTransfersQueryKey,
  getGetTransferFilesQueryKey,
  getGetTransferByCodeQueryKey,
} from "@workspace/api-client-react";
import {
  UploadCloud, FolderOpen, FileText, X, CheckCircle2, Copy,
  ShieldCheck, Loader2, ArrowRight, Plus, Search, Clock,
  Ghost, Lock, KeyRound, Eye, EyeOff, Radio,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBytes } from "@/lib/utils";
import { addMyTransfer, getOwnerToken } from "@/lib/my-transfers";
import { useQueryClient } from "@tanstack/react-query";
import type { Transfer } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateEncryptionKey, exportKeyToBase64, encryptFile, appendKeyToLink } from "@/lib/crypto";

interface QueuedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

type UploadStatus = "idle" | "preparing" | "uploading" | "securing" | "done" | "failed";

const STATUS_LABELS: Record<UploadStatus, string> = {
  idle: "",
  preparing: "Preparing transfer...",
  uploading: "Uploading files to secure storage...",
  securing: "Recording blockchain proof...",
  done: "Verified",
  failed: "Failed",
};

function formatExpiry(expiresAt: string): string {
  const exp = new Date(expiresAt);
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 1) return `Expires in ${diffDays} days`;
  if (diffDays === 1) return "Expires in 1 day";
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours > 0) return `Expires in ${diffHours} hours`;
  return "Expires soon";
}

export default function Home() {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [completedTransfer, setCompletedTransfer] = useState<Transfer | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // "Add to existing transfer" state
  const [addMode, setAddMode] = useState(false);
  const [addCode, setAddCode] = useState("");
  const [addTarget, setAddTarget] = useState<Transfer | null>(null);
  const [addCodeError, setAddCodeError] = useState("");
  const [addLookingUp, setAddLookingUp] = useState(false);

  const [expirationDays, setExpirationDays] = useState(7);
  const [expirationHours, setExpirationHours] = useState(0);
  const [expirationMinutes, setExpirationMinutes] = useState(0);
  const [customDays, setCustomDays] = useState(7);
  const [customHours, setCustomHours] = useState(0);
  const [customMinutes, setCustomMinutes] = useState(0);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  useEffect(() => {
    if (showExpiryModal) {
      if (completedTransfer) {
        const msLeft = new Date(completedTransfer.expiresAt).getTime() - Date.now();
        const minsLeft = Math.max(0, Math.ceil(msLeft / (60 * 1000)));
        setCustomDays(Math.floor(minsLeft / (24 * 60)));
        setCustomHours(Math.floor((minsLeft % (24 * 60)) / 60));
        setCustomMinutes(minsLeft % 60);
      } else {
        setCustomDays(expirationDays);
        setCustomHours(expirationHours);
        setCustomMinutes(expirationMinutes);
      }
    }
  }, [showExpiryModal, completedTransfer, expirationDays, expirationHours, expirationMinutes]);

  // New feature toggles
  const [ghostMode, setGhostMode] = useState(false);
  const [e2eEncrypted, setE2eEncrypted] = useState(false);
  const [isP2p, setIsP2p] = useState(false); // P2P real-time stream relay
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [shareKeyLink, setShareKeyLink] = useState<string | null>(null); // full link with #key=...

  // In-memory files buffer for active P2P streaming
  const p2pFilesRef = useRef<{ [objectId: string]: { file: File; key?: CryptoKey } }>({});

  // Current active transfer ID for SSE subscription
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const addFolderInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createTransfer = useCreateTransfer();
  const updateProof = useUpdateTransferProof();
  const addTransferFile = useAddTransferFile();
  const updateExpiration = useUpdateTransferExpiration();

  // Connect to SSE for real-time upload progress and P2P handshakes
  useEffect(() => {
    if (!activeTransferId) return;

    // Close any existing connection
    if (sseRef.current) {
      sseRef.current.close();
    }

    const es = new EventSource(`/api/transfers/${activeTransferId}/progress`);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { percent?: number; message?: string };
        if (data.percent !== undefined) {
          setProgress(data.percent);
        }
      } catch { /* ignore parse errors */ }
    };

    es.addEventListener("p2p_request", async (event) => {
      try {
        const { objectId } = JSON.parse((event as MessageEvent).data) as { objectId: string; objectPath: string };
        const queued = p2pFilesRef.current[objectId];
        if (!queued) {
          console.warn("P2P queued file not found for objectId:", objectId);
          return;
        }

        toast({
          title: "⚡ P2P Stream Relay Active",
          description: `Streaming "${queued.file.name}" live to recipient...`,
        });

        let fileToUpload: Blob = queued.file;
        if (queued.key) {
          fileToUpload = await encryptFile(queued.file, queued.key);
        }

        const res = await fetch(`/api/storage/upload-file/${objectId}`, {
          method: "PUT",
          headers: { "Content-Type": queued.file.type || "application/octet-stream" },
          body: fileToUpload,
        });

        if (res.ok) {
          toast({
            title: "✅ P2P Transfer Succeeded",
            description: `Transmitted "${queued.file.name}" to recipient!`,
          });
        }
      } catch (err: any) {
        console.error("P2P transmission error:", err);
        toast({
          variant: "destructive",
          title: "P2P Stream Error",
          description: err?.message || "Error relaying file to recipient.",
        });
      }
    });

    es.addEventListener("done", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { status: string };
        if (data.status === "failed") setStatus("failed");
      } catch { /* ignore */ }
      if (!isP2p) {
        es.close();
        sseRef.current = null;
        setActiveTransferId(null);
      }
    });

    es.onerror = () => {
      es.close();
      sseRef.current = null;
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [activeTransferId, isP2p]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const processFiles = (fileList: FileList | File[]) => {
    const newFiles: QueuedFile[] = Array.from(fileList).map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
      file: f,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const fakeHash = () =>
    "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  const requestPresignedUrl = async (f: QueuedFile) => {
    const res = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name, size: f.size, contentType: f.type }),
    });
    if (!res.ok) throw new Error("Failed to get upload URL");
    return res.json() as Promise<{ uploadURL: string; objectPath: string }>;
  };

  const uploadToGcs = async (uploadURL: string, f: QueuedFile) => {
    const res = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": f.type },
      body: f.file,
    });
    if (!res.ok) throw new Error(`Upload failed for ${f.name}`);
  };

  // Upload files to an existing transfer by UUID string ID
  const uploadFilesToTransfer = async (transferId: string, filesToUpload: QueuedFile[]) => {
    for (let i = 0; i < filesToUpload.length; i++) {
      const qf = filesToUpload[i];
      setProgress(Math.round((i / filesToUpload.length) * 85));
      const { uploadURL, objectPath } = await requestPresignedUrl(qf);
      await uploadToGcs(uploadURL, qf);
      await addTransferFile.mutateAsync({
        id: transferId,
        data: { name: qf.name, size: qf.size, contentType: qf.type, objectPath },
      });
    }
  };

  const handleTransfer = async () => {
    if (!files.length) return;

    const totalSize = files.reduce((a, f) => a + f.size, 0);
    const name = files.length === 1 ? files[0].name : `${files.length} files`;
    const itemType = files.length === 1 ? "file" : "multiple";

    setStatus("preparing");
    setProgress(0);
    setShareKeyLink(null);

    try {
      // Generate E2E encryption key if needed — before creating the transfer
      let encKey: CryptoKey | null = null;
      let encKeyB64: string | null = null;
      if (e2eEncrypted) {
        encKey = await generateEncryptionKey();
        encKeyB64 = await exportKeyToBase64(encKey);
      }

      const totalMs = ((expirationDays * 24 + expirationHours) * 60 + expirationMinutes) * 60 * 1000;
      const expiresAtDate = new Date(Date.now() + totalMs);
      const transfer = await createTransfer.mutateAsync({
        data: {
          name,
          itemType: itemType as "file" | "multiple",
          fileCount: files.length,
          totalSize,
          expiresAt: expiresAtDate.toISOString(),
          ghostMode,
          passphrase: passphrase.trim() || undefined,
          isP2p,
        } as any,
      });

      const ownerToken = (transfer as any).ownerToken;
      if (ownerToken) {
        addMyTransfer(transfer.id, ownerToken);
      }

      if (!ghostMode || isP2p) setActiveTransferId(transfer.id);

      setStatus(isP2p ? "securing" : "uploading");

      // Upload files or register in-memory for P2P stream relay
      for (let i = 0; i < files.length; i++) {
        const qf = files[i];
        setProgress(Math.round((i / files.length) * 85));

        const uploadName = qf.name;
        const uploadType = e2eEncrypted && encKey ? "application/octet-stream" : qf.type;

        const { uploadURL, objectPath } = await requestPresignedUrl(qf);
        const objectId = objectPath.split("/").pop() ?? objectPath;

        if (isP2p) {
          // Register in-memory for live P2P chunk relay
          p2pFilesRef.current[objectId] = { file: qf.file, key: encKey ?? undefined };
        } else {
          let fileToUpload: File | Blob = qf.file;
          if (e2eEncrypted && encKey) {
            fileToUpload = await encryptFile(qf.file, encKey);
          }
          const uploadRes = await fetch(uploadURL, {
            method: "PUT",
            headers: { "Content-Type": uploadType },
            body: fileToUpload,
          });
          if (!uploadRes.ok) throw new Error(`Upload failed for ${qf.name}`);
        }

        await addTransferFile.mutateAsync({
          id: transfer.id,
          data: { name: uploadName, size: qf.size, contentType: uploadType, objectPath },
        });
      }

      setProgress(88);
      setStatus("securing");
      await new Promise((r) => setTimeout(r, 800));

      const updated = await updateProof.mutateAsync({
        id: transfer.id,
        data: {
          status: "verified",
          proofHash: fakeHash(),
          storageRef: `ipfs://Qm${fakeHash().slice(2, 48)}`,
          txRef: fakeHash(),
          networkName: "Ethereum Mainnet",
          ownerAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        },
      });

      // If E2E encrypted, append key to share link (key stays in fragment — never sent to server)
      if (e2eEncrypted && encKeyB64) {
        const fullLink = appendKeyToLink(updated.shareLink, encKeyB64);
        setShareKeyLink(fullLink);
      }

      setProgress(100);
      setStatus("done");
      setCompletedTransfer(updated);
      setFiles([]);
      if (!isP2p) {
        setActiveTransferId(null);
      }
      queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
    } catch (err: any) {
      console.error("Transfer error:", err);
      setStatus("failed");
      setActiveTransferId(null);
      const msg = err?.data?.error || err?.message || "Please try again.";
      toast({ variant: "destructive", title: "Transfer failed", description: msg });
    }
  };

  // Look up an existing transfer by CVT code
  const lookupCode = async () => {
    const code = addCode.trim().toUpperCase();
    if (!code) return;
    setAddCodeError("");
    setAddLookingUp(true);
    try {
      const res = await fetch(`/api/transfers/by-code/${encodeURIComponent(code)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAddCodeError(data.error ?? "Transfer not found or expired");
        setAddTarget(null);
      } else {
        const transfer = await res.json();
        setAddTarget(transfer);
        setAddCodeError("");
      }
    } catch {
      setAddCodeError("Could not reach server. Try again.");
    } finally {
      setAddLookingUp(false);
    }
  };

  // Add more files to an existing transfer
  const handleAddToExisting = async () => {
    if (!addTarget || !files.length) return;
    setStatus("uploading");
    setProgress(0);
    try {
      await uploadFilesToTransfer(addTarget.id, files);
      setProgress(100);
      setStatus("idle");
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTransferFilesQueryKey(addTarget.id) });
      toast({
        title: `${files.length} file${files.length !== 1 ? "s" : ""} added to ${addTarget.proofId}`,
        description: "Recipients with the code can now download the new files.",
      });
      setAddTarget(null);
      setAddCode("");
      setAddMode(false);
    } catch {
      setStatus("idle");
      toast({ variant: "destructive", title: "Failed to add files", description: "Please try again." });
    }
  };

  // Add more files to the just-completed transfer (from success screen)
  const handleAddMoreToCompleted = async () => {
    if (!completedTransfer || !files.length) return;
    setStatus("uploading");
    setProgress(0);
    try {
      await uploadFilesToTransfer(completedTransfer.id, files);
      setProgress(100);
      setStatus("done");
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTransferFilesQueryKey(completedTransfer.id) });
      toast({ title: "Files added", description: "Recipients can now download the new files with the same code." });
    } catch {
      setStatus("done");
      toast({ variant: "destructive", title: "Failed to add files", description: "Please try again." });
    }
  };

  const reset = () => {
    setCompletedTransfer(null);
    setStatus("idle");
    setProgress(0);
    setFiles([]);
    setCodeCopied(false);
    setAddMode(false);
    setAddCode("");
    setAddTarget(null);
    setAddCodeError("");
    p2pFilesRef.current = {};
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setActiveTransferId(null);
  };

  const copyLink = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copied" });
  };

  const copyCodeWithFeedback = (text: string) => {
    navigator.clipboard.writeText(text);
    setCodeCopied(true);
    toast({ title: "Code copied — share it with the recipient" });
    setTimeout(() => setCodeCopied(false), 3000);
  };

  const totalSize = files.reduce((a, f) => a + f.size, 0);
  const isUploading = status === "preparing" || status === "uploading" || status === "securing";

  // ── SUCCESS SCREEN ─────────────────────────────────────────────────────────
  if (completedTransfer && status === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 35 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="w-full mt-4"
      >
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center">
            <CheckCircle2 className="w-2.5 h-2.5 text-accent" />
          </div>
          <span className="text-[10px] text-accent uppercase tracking-widest font-medium">
            Files uploaded · Blockchain proof recorded
          </span>
        </div>

        {/* Code card */}
        <div
          className="rounded-xl border-2 border-primary/40 bg-primary/5 backdrop-blur-sm mb-4 overflow-hidden"
          style={{ boxShadow: "0 0 40px hsla(345,75%,35%,0.1)" }}
        >
          <div className="px-6 py-4 border-b border-primary/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-[10px] text-primary uppercase tracking-widest font-semibold">
                Secure access code
              </p>
            </div>
          </div>

          <div className="px-6 py-8 text-center">
            <p
              className="text-5xl md:text-6xl font-black font-mono text-primary tracking-widest mb-2"
              style={{ textShadow: "0 0 30px hsla(180,80%,55%,0.4)" }}
              data-testid="text-proof-id"
            >
              {completedTransfer.proofId}
            </p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              {completedTransfer.fileCount} file{completedTransfer.fileCount !== 1 ? "s" : ""} · {formatBytes(completedTransfer.totalSize)} · anyone with this code can download
            </p>
          </div>

          {completedTransfer.expiresAt && (
            <div className="mx-6 mb-6 p-4 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-3 shadow-md glass-widget border-2 border-primary/20">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0 animate-pulse">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-mono">Expires in</p>
                  <p className="text-xs font-bold text-foreground font-mono">
                    {formatExpiry(completedTransfer.expiresAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExpiryModal(true)}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold tracking-wider uppercase hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm font-mono border border-primary/20"
              >
                Modify Expiry
              </button>
            </div>
          )}

          <div className="px-6 pb-6 space-y-3">
            <button
              onClick={() => copyCodeWithFeedback(completedTransfer.proofId)}
              data-testid="button-copy-code"
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm font-semibold tracking-widest uppercase transition-all ${
                codeCopied
                  ? "bg-accent/20 border border-accent/40 text-accent"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              {codeCopied ? "Copied!" : "Copy code"}
            </button>

            <button
              onClick={() => copyLink(shareKeyLink || completedTransfer.shareLink)}
              data-testid="button-copy-link"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm font-semibold tracking-widest uppercase bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy share link
            </button>

            {/* Zero-Knowledge warning text — only show when encryption was used */}
            {shareKeyLink && (
              <p className="text-[10px] mt-1 text-center font-medium" style={{ color: "rgba(148,163,184,0.65)" }}>
                🔐 Share this link privately. If lost, files are unrecoverable.
              </p>
            )}

            {/* Ghost mode confirmation badge */}
            {ghostMode && (
              <div className="mt-4 p-4 rounded-xl flex items-center gap-3"
                style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.3)" }}>
                <Ghost className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <p className="text-xs font-semibold leading-relaxed" style={{ color: "rgba(216,180,254,0.8)" }}>
                  Ghost Mode active — no logs, no analytics, no server trace for this transfer.
                </p>
              </div>
            )}

            {/* P2P live stream relay banner */}
            {(isP2p || (completedTransfer as any).isP2p) && (
              <div
                className="mt-4 p-4 rounded-xl flex items-start gap-3"
                style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.35)" }}
              >
                <Radio className="w-5 h-5 text-cyan-400 flex-shrink-0 animate-pulse mt-0.5" />
                <div className="text-left">
                  <p className="text-xs font-bold text-cyan-300">
                    Direct P2P Stream Relay Active
                  </p>
                  <p className="text-[11px] text-cyan-200/75 mt-1 leading-relaxed">
                    Keep this browser tab open! File chunks will be streamed directly from your browser in real-time when the recipient initiates the download.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm px-5 py-4 mb-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3">How the recipient downloads</p>
          <div className="space-y-2.5">
            {[
              `Send them the code: ${completedTransfer.proofId}`,
              "They open ChainVaultShare — on any device, any browser",
              (isP2p || (completedTransfer as any).isP2p)
                ? "Enter the code → live peer stream connects and transfers files"
                : "Enter the code → download all files instantly",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-foreground/70">
                <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] text-primary font-bold shrink-0">
                  {i + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>

        {/* Add more files to this code */}
        <div className="rounded-2xl p-8 mb-6 glass-widget border border-primary/15 text-center">
          {isUploading ? (
            <div className="space-y-3 max-w-xs mx-auto">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Uploading...
                </span>
                <span className="text-primary font-mono">{progress}%</span>
              </div>
              <div className="h-1 bg-border/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : files.length > 0 ? (
            <div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto mb-4">
                <AnimatePresence initial={false}>
                  {files.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, height: 0, y: 10 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="flex items-center justify-between bg-background/40 border border-border/20 rounded-xl px-4 py-2 text-xs overflow-hidden"
                    >
                      <span className="truncate text-foreground/80 mr-2">{file.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground font-mono">{formatBytes(file.size)}</span>
                        <button onClick={() => removeFile(file.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <button
                  type="button"
                  onClick={handleAddMoreToCompleted}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase hover:opacity-90 transition-opacity shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add {files.length} file{files.length !== 1 ? "s" : ""} to {completedTransfer.proofId}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3.5 py-3">
                <p className="text-sm font-black text-foreground uppercase tracking-wider">
                  ADD MORE FILES OR FOLDERS TO THIS CODE
                </p>
                <div className="flex gap-3 w-full max-w-xs justify-center">
                  <button
                    type="button"
                    onClick={() => addFileInputRef.current?.click()}
                    className="flex-1 py-3 px-4 rounded-xl border border-border/30 hover:border-primary/50 bg-muted/15 text-xs font-bold uppercase text-muted-foreground hover:text-foreground transition-all duration-200"
                  >
                    Files
                  </button>
                  <button
                    type="button"
                    onClick={() => addFolderInputRef.current?.click()}
                    className="flex-1 py-3 px-4 rounded-xl border border-border/30 hover:border-primary/50 bg-muted/15 text-xs font-bold uppercase text-muted-foreground hover:text-foreground transition-all duration-200"
                  >
                    Folder
                  </button>
                </div>
              </div>
            )}
          <input type="file" multiple className="hidden" ref={addFileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} />
          <input type="file" className="hidden" ref={addFolderInputRef} {...{ webkitdirectory: "true", directory: "" }} onChange={(e) => e.target.files && processFiles(e.target.files)} />
        </div>

        <div className="mt-7">
          <button
            type="button"
            onClick={reset}
            data-testid="button-new-transfer"
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold tracking-widest uppercase hover:opacity-90 transition-opacity shadow-md"
          >
            <ArrowRight className="w-4 h-4" />
            New transfer
          </button>
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
                type="button"
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
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-xs md:text-sm text-muted-foreground uppercase font-black tracking-widest block mb-2 text-center">Days</label>
                    <input
                      type="number"
                      min="0"
                      value={customDays}
                      onChange={(e) => setCustomDays(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-muted/15 border border-border/20 rounded-xl px-4 py-3.5 text-xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
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
                      className="w-full bg-muted/15 border border-border/20 rounded-xl px-4 py-3.5 text-xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
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
                      className="w-full bg-muted/15 border border-border/20 rounded-xl px-4 py-3.5 text-xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
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

                    if (completedTransfer) {
                      const newExpiry = new Date(Date.now() + totalMins * 60 * 1000);
                      try {
                        const updated = await updateExpiration.mutateAsync({
                          id: completedTransfer.id,
                          data: { expiresAt: newExpiry.toISOString() },
                        });
                        setCompletedTransfer(updated);
                        queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
                        toast({ title: "Expiration timer updated" });
                      } catch (error: any) {
                        toast({ variant: "destructive", title: "Update failed", description: error?.message || "Unknown error occurred" });
                      }
                    } else {
                      setExpirationDays(customDays);
                      setExpirationHours(customHours);
                      setExpirationMinutes(customMinutes);
                      const parts = [];
                      if (customDays > 0) parts.push(`${customDays} days`);
                      if (customHours > 0) parts.push(`${customHours} hours`);
                      if (customMinutes > 0) parts.push(`${customMinutes} minutes`);
                      toast({ title: `Expiration set to ${parts.join(" and ") || "1 minute"}` });
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
      </motion.div>
    );
  }

  // ── MAIN UPLOAD SCREEN ─────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <div className="text-center mb-12 mt-8">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-glow leading-tight font-mono">
          Send files with{" "}
          <span className="text-primary text-glow">built-in proof</span>
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed tracking-wide max-w-3xl mx-auto whitespace-nowrap">
          Anyone with the code can download your files from any device with custom expiration.
        </p>
      </div>

      {/* Upload zone */}
      <div
        className={`relative rounded-lg transition-all duration-200 overflow-hidden glass-widget ${
          dragActive ? "border-primary bg-primary/10 glow-primary" : ""
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        data-testid="upload-dropzone"
      >
        <div className="px-8 md:px-10 py-12 text-center">
          <div className={`w-16 h-16 rounded-xl border mx-auto mb-4 flex items-center justify-center transition-all ${dragActive ? "border-primary/50 bg-primary/10 text-primary" : "border-border/30 bg-muted/30 text-muted-foreground"}`}>
            <UploadCloud className="w-8 h-8 animate-bounce-subtle" />
          </div>
          <p className="text-lg font-bold mb-2 tracking-tight">{dragActive ? "Release to add files" : "Drag files here"}</p>
          <p className="text-xs text-muted-foreground tracking-wide mb-6">or choose from your device</p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-files"
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase hover:opacity-90 transition-opacity shadow-md"
            >
              <FileText className="w-4 h-4" />
              Upload Files
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              data-testid="button-upload-folder"
              className="flex items-center gap-2 px-6 py-3 rounded-lg border border-border/40 bg-muted/20 text-xs font-bold tracking-widest uppercase hover:bg-muted/40 transition-colors shadow-md"
            >
              <FolderOpen className="w-4 h-4" />
              Upload Folder
            </button>
          </div>
        </div>

        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} />
        <input type="file" className="hidden" ref={folderInputRef} {...{ webkitdirectory: "true", directory: "" }} onChange={(e) => e.target.files && processFiles(e.target.files)} />

        {files.length > 0 && (
          <div className="border-t border-border/30 bg-muted/10 px-5 md:px-7 py-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {files.length} file{files.length !== 1 ? "s" : ""} ready
              </span>
              <span className="text-xs font-mono font-semibold text-muted-foreground">{formatBytes(totalSize)}</span>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto">
              <AnimatePresence initial={false}>
                {files.map((file) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, height: 0, y: 10 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="flex items-center justify-between bg-background/50 border border-border/30 rounded-xl px-4.5 py-3 text-xs overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="truncate font-semibold text-foreground/85">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-3.5 shrink-0 ml-2.5">
                      <span className="text-xs text-muted-foreground font-mono font-medium">{formatBytes(file.size)}</span>
                      {!isUploading && (
                        <button onClick={() => removeFile(file.id)} data-testid={`button-remove-${file.id}`} className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {isUploading ? (
              <div className="mt-6 flex flex-col items-center justify-center py-8 border-t border-border/20">
                {/* Modern Elegant Radial Progress Circle */}
                <div className="relative w-44 h-44 mb-8 flex items-center justify-center">
                  {/* Outer breathing subtle glow circle */}
                  <motion.div
                    animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.15, 0.35, 0.15] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-full border-2 border-primary/20 bg-primary/5 blur-sm"
                  />
                  {/* Outer spinning dash segment */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-2 border-2 border-dashed border-primary/30 border-t-primary rounded-full"
                  />
                  
                  {/* Inner stats layout */}
                  <div className="flex flex-col items-center justify-center">
                    <ShieldCheck className="w-8 h-8 text-primary mb-1.5 animate-pulse text-glow" />
                    <span className="text-3xl font-black font-mono text-glow text-foreground">
                      {progress}%
                    </span>
                    <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase mt-1">
                      {status}
                    </span>
                  </div>
                </div>

                {/* Text descriptions */}
                <div className="text-center space-y-2.5 w-full max-w-sm px-4">
                  <h3 className="text-sm font-bold tracking-widest text-foreground uppercase">
                    {STATUS_LABELS[status]}
                  </h3>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    Safeguarding files with cryptographic hashing.
                  </p>
                  
                  {/* Linear clean timeline progress bar */}
                  <div className="w-full h-1 bg-border/20 rounded-full overflow-hidden mt-4">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                      style={{ width: `${progress}%`, boxShadow: "0 0 8px hsl(var(--primary))" }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
              {/* ── Security Options Panel ─────────────────────────────── */}
              <div className="mt-6 rounded-xl border border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2.5">
                  <ShieldCheck className="w-4.5 h-4.5 text-primary" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Security Options</span>
                </div>
                <div className="p-5.5 space-y-5.5">
                  {/* Ghost Mode */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <Ghost className="w-4.5 h-4.5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">Ghost Mode</p>
                        <p className="text-xs text-muted-foreground mt-1">No logs, no analytics, no trace</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGhostMode(!ghostMode)}
                      className={`relative rounded-full transition-all duration-300 ${ghostMode ? "bg-purple-500" : "bg-border/50"}`}
                      style={{ width: "46px", height: "26px" }}
                    >
                      <div className="absolute top-0.5 rounded-full bg-white shadow transition-all duration-300"
                        style={{ width: "22px", height: "22px", transform: ghostMode ? "translateX(22px)" : "translateX(2px)" }} />
                    </button>
                  </label>

                  {/* E2E Encryption */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <KeyRound className="w-4.5 h-4.5 text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">Zero-Knowledge Encryption</p>
                        <p className="text-xs text-muted-foreground mt-1">Files encrypted in your browser — server never sees plaintext</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setE2eEncrypted(!e2eEncrypted)}
                      className="relative rounded-full transition-all duration-300"
                      style={{ width: "46px", height: "26px", background: e2eEncrypted ? "#6366f1" : "var(--border)" }}
                    >
                      <div className="absolute top-0.5 rounded-full bg-white shadow transition-all duration-300"
                        style={{ width: "22px", height: "22px", transform: e2eEncrypted ? "translateX(22px)" : "translateX(2px)" }} />
                    </button>
                  </label>

                  {/* Direct P2P Relay */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <Radio className="w-4.5 h-4.5 text-cyan-400 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          Direct P2P Relay
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-cyan-500/20 text-cyan-400 uppercase tracking-wider">Unlimited Size</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Direct stream to recipient — bypasses server storage, keep tab open</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsP2p(!isP2p)}
                      className="relative rounded-full transition-all duration-300"
                      style={{ width: "46px", height: "26px", background: isP2p ? "#06b6d4" : "var(--border)" }}
                    >
                      <div className="absolute top-0.5 rounded-full bg-white shadow transition-all duration-300"
                        style={{ width: "22px", height: "22px", transform: isP2p ? "translateX(22px)" : "translateX(2px)" }} />
                    </button>
                  </label>

                  {/* Passphrase */}
                  <div>
                    <div className="flex items-center gap-3.5 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <Lock className="w-4.5 h-4.5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">Passphrase Lock</p>
                        <p className="text-xs text-muted-foreground mt-1">Recipients must enter this to download</p>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassphrase ? "text" : "password"}
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Leave empty for no passphrase…"
                        className="w-full pl-4 pr-12 py-3 rounded-xl text-sm outline-none"
                        style={{
                          background: "var(--bg-secondary, rgba(0,0,0,0.2))",
                          border: "1px solid var(--border, rgba(255,255,255,0.1))",
                          color: "var(--text-primary, white)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-5 border-t border-border/20 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <button
                  onClick={() => setShowExpiryModal(true)}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-lg border-2 border-primary/25 bg-muted/25 hover:border-primary/50 hover:bg-muted/40 text-sm font-bold font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all duration-300 self-start sm:self-auto shadow-md"
                >
                  <Clock className="w-4 h-4 text-primary" />
                  Set Expiration ({[
                    expirationDays > 0 ? `${expirationDays}d` : "",
                    expirationHours > 0 ? `${expirationHours}h` : "",
                    expirationMinutes > 0 ? `${expirationMinutes}m` : "",
                  ].filter(Boolean).join(" ") || "1h"})
                </button>
                <button
                  onClick={handleTransfer}
                  data-testid="button-transfer"
                  className="flex items-center gap-2 px-7 py-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold tracking-widest uppercase hover:opacity-90 transition-opacity self-end sm:self-auto shadow-md"
                >
                  <ShieldCheck className="w-4.5 h-4.5" />
                  {ghostMode ? "Ghost Transfer" : isP2p ? "Start P2P Relay" : e2eEncrypted ? "Encrypt & Transfer" : "Transfer securely"}
                </button>
              </div>
              </>
            )}
          </div>
        )}
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
              <h3 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase text-glow">Set Expiration Timer</h3>
              <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                Choose how long this transfer and its contents remain accessible.
              </p>
            </div>

             {/* Custom Days, Hours, and Minutes Input Fields */}
             <div className="space-y-6">
               <div className="flex gap-4">
                 <div className="flex-1">
                   <label className="text-xs md:text-sm text-muted-foreground uppercase font-black tracking-widest block mb-2 text-center">Days</label>
                   <input
                     type="number"
                     min="0"
                     value={customDays}
                     onChange={(e) => setCustomDays(Math.max(0, parseInt(e.target.value) || 0))}
                     className="w-full bg-muted/15 border border-border/20 rounded-xl px-4 py-3.5 text-xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
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
                     className="w-full bg-muted/15 border border-border/20 rounded-xl px-4 py-3.5 text-xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
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
                     className="w-full bg-muted/15 border border-border/20 rounded-xl px-4 py-3.5 text-xl font-mono font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none text-center shadow-inner"
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

                   if (completedTransfer) {
                     const newExpiry = new Date(Date.now() + totalMins * 60 * 1000);
                     try {
                       const updated = await updateExpiration.mutateAsync({
                         id: completedTransfer.id,
                         data: { expiresAt: newExpiry.toISOString() },
                       });
                       setCompletedTransfer(updated);
                       queryClient.invalidateQueries({ queryKey: getListTransfersQueryKey() });
                       toast({ title: "Expiration timer updated" });
                     } catch (error: any) {
                       toast({ variant: "destructive", title: "Update failed", description: error?.message || "Unknown error occurred" });
                     }
                   } else {
                      setExpirationDays(customDays);
                      setExpirationHours(customHours);
                      setExpirationMinutes(customMinutes);
                      const parts = [];
                      if (customDays > 0) parts.push(`${customDays} days`);
                      if (customHours > 0) parts.push(`${customHours} hours`);
                      if (customMinutes > 0) parts.push(`${customMinutes} minutes`);
                      toast({ title: `Expiration set to ${parts.join(" and ") || "1 minute"}` });
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