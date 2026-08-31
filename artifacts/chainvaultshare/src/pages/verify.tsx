import { useState, useEffect } from "react";
import { useVerifyTransfer } from "@workspace/api-client-react";
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Loader2, FileText, Ghost, Lock, KeyRound, Radio } from "lucide-react";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import type { VerificationResult } from "@workspace/api-client-react";

export default function Verify() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const verifyTransfer = useVerifyTransfer();

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    try {
      const res = await verifyTransfer.mutateAsync({ data: { query } });
      setResult(res);
      setShowAdvanced(false);
    } catch {
      setResult({ verified: false, message: "Verification service unavailable. Please try again." });
    }
  };

  useEffect(() => {
    if (initialQuery) handleVerify();
  }, [initialQuery]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 mt-5">
        <h1 className="text-4xl font-black tracking-tight text-glow">Verify transfer</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Verify cryptographic integrity, ownership, and delivery status of any transfer.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleVerify} className="mb-10">
        <div className="flex items-center gap-2 p-2 rounded-3xl liquid-glass border border-white/15 shadow-2xl">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter Proof ID or Access Code (e.g. CVT-4291)…"
            data-testid="input-verify-query"
            className="flex-1 bg-transparent px-5 py-3.5 font-mono text-sm md:text-base outline-none text-foreground placeholder:text-muted-foreground/40 font-bold uppercase tracking-wider"
          />
          <button
            type="submit"
            disabled={verifyTransfer.isPending || !query.trim()}
            data-testid="button-verify-submit"
            className="liquid-button px-7 py-3.5 rounded-2xl text-xs md:text-sm font-black tracking-widest uppercase text-primary-foreground flex items-center gap-2 font-mono shadow-md shrink-0"
          >
            {verifyTransfer.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify
          </button>
        </div>
      </form>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {result.verified && result.transfer ? (
            <div className="rounded-3xl overflow-hidden liquid-glass shadow-2xl border border-white/12">
              {/* Verified banner */}
              <div className="flex items-center gap-4.5 px-6.5 py-5.5 bg-accent/5 border-b border-accent/15">
                <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-bold text-accent tracking-wide">Verification successful</p>
                  <p className="text-xs text-muted-foreground mt-1">Transfer matches original proof · Ownership confirmed</p>
                </div>
              </div>

              {/* Details */}
              <div className="px-6.5 py-6 grid grid-cols-2 gap-x-10 gap-y-6">
                {/* Transfer info */}
                <div className="col-span-2 md:col-span-1 space-y-5.5">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Transfer details</p>
                  {(() => {
                    const isGhost = result.transfer.ghostMode;
                    const isPassphrase = !!(result.transfer as any).hasPassphrase || !!(result.transfer as any).passphraseHash;
                    const isE2E = result.transfer.e2eEncrypted;
                    const downloadCount = (result.transfer as any).downloadCount ?? 0;

                    // For passphrase transfers: show ONLY verified status and accurate downloads (no file details)
                    if (isPassphrase) {
                      return [
                        {
                          label: "Transfer Type",
                          value: (
                            <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                              <Lock className="w-4 h-4" />
                              Passphrase Protected Transfer
                            </span>
                          ),
                        },
                        {
                          label: "Security Status",
                          value: "Protected · Secret passcode required to unlock files",
                        },
                        {
                          label: "Created",
                          value: formatRelativeTime(result.transfer.createdAt),
                        },
                        {
                          label: "Downloads",
                          value: `${downloadCount} download${downloadCount !== 1 ? "s" : ""}`,
                        },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground/80 font-bold uppercase tracking-widest mb-1.5">{label}</p>
                          <p className="text-base font-semibold text-foreground/90">{value}</p>
                        </div>
                      ));
                    }

                    // For ghost transfers: name is masked to "Ghost transfer", no file metadata trace
                    if (isGhost) {
                      return [
                        {
                          label: "Name",
                          value: (
                            <span className="flex items-center gap-2 text-purple-400">
                              <Ghost className="w-4 h-4" />
                              Ghost transfer
                            </span>
                          ),
                        },
                        {
                          label: "Contents",
                          value: "Zero-Trace · No logs or metadata stored",
                        },
                        {
                          label: "Created",
                          value: formatRelativeTime(result.transfer.createdAt),
                        },
                        {
                          label: "Downloads",
                          value: `${downloadCount} download${downloadCount !== 1 ? "s" : ""}`,
                        },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground/80 font-bold uppercase tracking-widest mb-1.5">{label}</p>
                          <p className="text-base font-semibold text-foreground/90">{value}</p>
                        </div>
                      ));
                    }

                    // Standard or Zero-Knowledge transfers
                    return [
                      {
                        label: "Name",
                        value: (
                          <span className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            {result.transfer.name}
                            {isE2E && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-400 uppercase tracking-wider">
                                Zero-Knowledge
                              </span>
                            )}
                          </span>
                        ),
                      },
                      {
                        label: "Contents",
                        value: isE2E
                          ? `Zero-Knowledge Encrypted · ${result.transfer.fileCount} item${result.transfer.fileCount !== 1 ? "s" : ""} (${formatBytes(result.transfer.totalSize)})`
                          : `${formatBytes(result.transfer.totalSize)} · ${result.transfer.fileCount} item${result.transfer.fileCount !== 1 ? "s" : ""}`,
                      },
                      {
                        label: "Created",
                        value: formatRelativeTime(result.transfer.createdAt),
                      },
                      {
                        label: "Downloads",
                        value: `${downloadCount} download${downloadCount !== 1 ? "s" : ""}`,
                      },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground/80 font-bold uppercase tracking-widest mb-1.5">{label}</p>
                        <p className="text-base font-semibold text-foreground/90">{value}</p>
                      </div>
                    ));
                  })()}
                </div>

                {/* Proof summary */}
                <div className="col-span-2 md:col-span-1 space-y-5.5">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Proof summary</p>
                  <div className="rounded border border-border/20 bg-muted/10 px-5 py-5 space-y-4">
                    {[
                      "Recorded securely",
                      "Ownership confirmed",
                      "Transfer matches original proof",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2.5 text-sm text-foreground/80">
                        <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                        {item}
                      </div>
                    ))}
                    <div className="pt-3.5 mt-2 border-t border-border/20">
                      <p className="text-xs text-muted-foreground/80 font-bold uppercase tracking-widest mb-2">Proof ID</p>
                      <span className="font-mono text-sm font-bold bg-background/50 border border-border/30 px-3 py-1.5 rounded text-primary">
                        {result.transfer.proofId}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced proof drawer */}
              <div className="px-6.5 py-5 border-t border-border/20">
                <button
                  onClick={() => setShowAdvanced((s) => !s)}
                  data-testid="button-advanced-proof"
                  className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
                >
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Technical proof details
                </button>
 
                {showAdvanced && (
                  <div className="mt-4 rounded bg-background/80 border border-border/20 p-5 font-mono text-xs space-y-4 overflow-x-auto">
                    {[
                      { label: "Proof Hash", value: result.transfer.proofHash ?? "N/A", color: "text-accent" },
                      { label: "Storage Reference", value: result.transfer.storageRef ?? "N/A", color: "text-primary" },
                      { label: "Transaction Ref", value: result.transfer.txRef ?? "N/A", color: "text-purple-400" },
                      { label: "Owner Address", value: result.transfer.ownerAddress ?? "Anonymous", color: "text-foreground/70" },
                      { label: "Network", value: result.transfer.networkName ?? "ChainVault Network", color: "text-foreground/70" },
                      {
                        label: "Verified At",
                        value: result.transfer.verifiedAt
                          ? new Date(result.transfer.verifiedAt).toISOString()
                          : "Pending",
                        color: "text-foreground/70",
                      },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <p className="text-muted-foreground/60 text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
                        <p className={`${color} break-all`}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded border border-destructive/20 bg-card/60 backdrop-blur-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 bg-destructive/5">
                <div className="w-6 h-6 rounded-full bg-destructive/20 border border-destructive/30 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-3 h-3 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-destructive tracking-wide">Not verified</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{result.message}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!result && (
        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground/60 tracking-wider font-mono">
            Independently verify transfer authenticity and cryptographic integrity.
          </p>
        </div>
      )}
    </div>
  );
}
