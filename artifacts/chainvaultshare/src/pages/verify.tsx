import { useState, useEffect } from "react";
import { useVerifyTransfer } from "@workspace/api-client-react";
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Loader2, FileText } from "lucide-react";
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
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12 mt-8">
        <div className="w-16 h-16 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-center mx-auto mb-6 shadow-sm shadow-primary/10">
          <ShieldCheck className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-glow">Verify a transfer</h1>
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed tracking-wide max-w-xl mx-auto">
          Enter code or share link to verify transfer.
        </p>
      </div>

      <div
        className="rounded-2xl mb-10 overflow-hidden glass-widget border border-primary/20"
      >
        <form onSubmit={handleVerify} className="flex items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="CVT-2048 or https://chainvaultshare.app/t/..."
            className="flex-1 bg-transparent px-6 py-4.5 text-lg text-foreground placeholder:text-muted-foreground/40 outline-none font-mono"
            data-testid="input-verify-query"
          />
          <button
            type="submit"
            disabled={verifyTransfer.isPending}
            data-testid="button-verify-submit"
            className="px-10 py-4.5 text-base font-bold tracking-widest uppercase text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 transition-opacity border-l border-border/20 shrink-0 font-mono"
          >
            {verifyTransfer.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Verify"
            )}
          </button>
        </form>
      </div>

      {/* Result */}
      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-400">
          {result.verified && result.transfer ? (
            <div className="rounded overflow-hidden glass-widget">
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
                  {[
                    {
                      label: "Name",
                      value: (
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          {result.transfer.name}
                        </span>
                      ),
                    },
                    {
                      label: "Contents",
                      value: `${formatBytes(result.transfer.totalSize)} · ${result.transfer.fileCount} item${result.transfer.fileCount !== 1 ? "s" : ""}`,
                    },
                    {
                      label: "Created",
                      value: formatRelativeTime(result.transfer.createdAt),
                    },
                    {
                      label: "Downloads",
                      value: `${(result.transfer as any).downloadCount ?? 0} download${(result.transfer as any).downloadCount !== 1 ? "s" : ""}`,
                    },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground/80 font-bold uppercase tracking-widest mb-1.5">{label}</p>
                      <p className="text-base font-semibold text-foreground/90">{value}</p>
                    </div>
                  ))}
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
