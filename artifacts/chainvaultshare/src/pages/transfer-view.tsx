import { useRoute, Link } from "wouter";
import { useGetTransfer, getGetTransferQueryKey } from "@workspace/api-client-react";
import {
  ShieldCheck, Copy, FileText, FolderOpen, Files,
  Loader2, AlertCircle, ArrowRight, ChevronDown, ChevronUp
} from "lucide-react";
import { useState } from "react";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getMyTransferIds } from "@/lib/my-transfers";

function ItemIcon({ type }: { type: string }) {
  if (type === "folder") return <FolderOpen className="w-5 h-5" />;
  if (type === "multiple") return <Files className="w-5 h-5" />;
  return <FileText className="w-5 h-5" />;
}

export default function TransferView() {
  const [, params] = useRoute("/t/:id");
  const id = params?.id ? params.id : null;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  const { data: transfer, isLoading, error } = useGetTransfer(
    id as string,
    { query: { enabled: !!id, queryKey: getGetTransferQueryKey(id as string) } }
  );

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  // Redirect recipient straight to Receive page while preserving URL hash key
  if (transfer && !isLoading) {
    const myIds = getMyTransferIds();
    if (!myIds.includes(transfer.id)) {
      const hash = window.location.hash;
      window.location.replace(`/?code=${transfer.proofId}${hash}`);
      return null;
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-4" />
        <p className="text-xs text-muted-foreground tracking-widest uppercase">Loading transfer...</p>
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center">
        <div className="w-10 h-10 rounded border border-destructive/20 bg-destructive/5 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-4 h-4 text-destructive" />
        </div>
        <h2 className="text-sm font-semibold mb-2">Transfer not found</h2>
        <p className="text-xs text-muted-foreground mb-6">This link may be expired or invalid.</p>
        <Link href="/receive">
          <button className="text-xs text-primary hover:opacity-80 transition-opacity tracking-widest uppercase flex items-center gap-2 mx-auto">
            <ArrowRight className="w-3 h-3" />
            Enter a code manually
          </button>
        </Link>
      </div>
    );
  }

  const isVerified = transfer.status === "verified";

  return (
    <div className="max-w-xl mx-auto">
      <div className="mt-4 mb-8 text-center">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Shared transfer</p>
        <h1 className="text-2xl font-bold tracking-tight">{transfer.name}</h1>
      </div>

      <div className="rounded border border-border/30 bg-card/60 backdrop-blur-sm overflow-hidden">

        {/* Verification banner */}
        {isVerified ? (
          <div className="flex items-center gap-3 px-5 py-3.5 bg-accent/5 border-b border-accent/15">
            <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-2.5 h-2.5 text-accent" />
            </div>
            <p className="text-[10px] text-accent font-semibold uppercase tracking-widest">
              Verified on blockchain · Ownership confirmed
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-5 py-3.5 bg-muted/10 border-b border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest capitalize">
              Status: {transfer.status}
            </p>
          </div>
        )}

        {/* File summary */}
        <div className="px-5 py-5 space-y-5">
          <div className="flex items-center gap-4 p-4 rounded bg-muted/20 border border-border/20">
            <div className="w-12 h-12 rounded border border-border/20 bg-muted/30 flex items-center justify-center text-muted-foreground shrink-0">
              <ItemIcon type={transfer.itemType} />
            </div>
            <div>
              <p className="text-sm font-semibold mb-0.5">{transfer.name}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {formatBytes(transfer.totalSize)} · {transfer.fileCount} item{transfer.fileCount !== 1 ? "s" : ""}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                Shared {formatRelativeTime(transfer.createdAt)}
              </p>
            </div>
          </div>

          {/* Access code — prominently shown */}
          <div className="rounded border border-primary/20 bg-primary/5 px-5 py-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Your access code</p>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold font-mono text-primary tracking-widest">
                {transfer.proofId}
              </span>
              <button
                onClick={() => copy(transfer.proofId)}
                data-testid="button-copy-code"
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Save this code — use it on the Receive page to access files at any time.
            </p>
          </div>

          {/* How to retrieve */}
          <div className="rounded border border-border/20 bg-muted/10 px-4 py-4 space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">How to retrieve</p>
            {[
              `Copy your code: ${transfer.proofId}`,
              "Go to the Receive page",
              "Paste the code to access the files",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-foreground/70">
                <span className="w-4 h-4 rounded-full bg-muted/40 border border-border/30 flex items-center justify-center text-[9px] text-muted-foreground shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </div>
            ))}
          </div>

          {/* Action row */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link href={`/receive?code=${transfer.proofId}`}>
              <button
                data-testid="button-go-receive"
                className="flex items-center gap-2 px-5 py-2.5 rounded bg-primary text-primary-foreground text-xs font-medium tracking-widest uppercase hover:opacity-90 transition-opacity"
              >
                <ArrowRight className="w-3 h-3" />
                Go to Receive
              </button>
            </Link>
            <button
              onClick={() => copy(transfer.shareLink)}
              data-testid="button-copy-link"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy link
            </button>
          </div>

          {/* Advanced drawer */}
          {isVerified && (
            <div className="border-t border-border/20 pt-4">
              <button
                onClick={() => setShowAdvanced((s) => !s)}
                className="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
              >
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Technical proof details
              </button>

              {showAdvanced && (
                <div className="mt-3 rounded bg-background/80 border border-border/20 p-4 font-mono text-[11px] space-y-3 overflow-x-auto">
                  {[
                    { label: "Proof Hash", value: transfer.proofHash ?? "N/A", color: "text-accent" },
                    { label: "Storage Reference", value: transfer.storageRef ?? "N/A", color: "text-primary" },
                    { label: "Transaction Ref", value: transfer.txRef ?? "N/A", color: "text-purple-400" },
                    { label: "Owner Address", value: transfer.ownerAddress ?? "Anonymous" },
                    { label: "Network", value: transfer.networkName ?? "ChainVault Network" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <p className="text-muted-foreground/60 text-[10px] uppercase tracking-widest mb-0.5">{label}</p>
                      <p className={`${color ?? "text-foreground/70"} break-all`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
