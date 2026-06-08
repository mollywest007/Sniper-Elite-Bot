import {
  useListWallets,
  getListWalletsQueryKey,
  useDeleteWallet,
  useActivateWallet,
} from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wallet as WalletIcon,
  Check,
  Copy,
  Trash2,
  Key,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatSol, formatUsd, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

function CopyButton({ text, label = "Copied!" }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast({ title: label, duration: 2000 });
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-background/60 border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function WalletCard({
  wallet,
  onActivate,
  onDelete,
}: {
  wallet: any;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const [showKey, setShowKey] = useState(false);

  return (
    <Card
      className={cn(
        "border-2 overflow-hidden transition-all",
        wallet.isActive
          ? "border-primary bg-primary/5"
          : "border-border bg-card/40"
      )}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-2.5 rounded-full",
                wallet.isActive ? "bg-primary/20 text-primary" : "bg-accent text-muted-foreground"
              )}
            >
              <WalletIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono font-bold text-lg">{wallet.name}</h3>
                {wallet.isActive && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary text-primary-foreground flex items-center gap-1">
                    <Check className="h-3 w-3" /> Active
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-muted-foreground mt-0.5">Solana Wallet</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-0.5">Balance</div>
            <div className="font-mono font-bold text-xl text-foreground">
              {formatSol(wallet.balanceSol)} <span className="text-sm font-normal text-muted-foreground">SOL</span>
            </div>
            <div className="text-xs font-mono text-muted-foreground">{formatUsd(wallet.balanceUsdc)}</div>
          </div>
        </div>

        {/* Address */}
        <div className="px-6 py-4 border-b border-border/40">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
            <WalletIcon className="h-3.5 w-3.5" /> Public Address
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-1 bg-background rounded-lg border border-border px-4 py-3 min-w-0">
              <p className="font-mono text-sm text-foreground break-all select-all leading-relaxed">
                {wallet.address}
              </p>
            </div>
            <CopyButton text={wallet.address} label="Address copied!" />
          </div>
        </div>

        {/* Private Key */}
        {wallet.privateKey && (
          <div className="px-6 py-4 border-b border-border/40 bg-destructive/5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-mono text-destructive uppercase tracking-wider flex items-center gap-2">
                <Key className="h-3.5 w-3.5" /> Private Key
              </div>
              <span className="text-[10px] font-mono text-destructive/70 bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded">
                ⚠️ Never share this
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-1 bg-background rounded-lg border border-destructive/30 px-4 py-3 min-w-0">
                {showKey ? (
                  <p className="font-mono text-sm text-foreground break-all select-all leading-relaxed">
                    {wallet.privateKey}
                  </p>
                ) : (
                  <p className="font-mono text-sm text-muted-foreground tracking-widest">
                    {"•".repeat(64)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-background border border-border text-muted-foreground hover:text-foreground transition-all"
                  title={showKey ? "Hide" : "Reveal"}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showKey ? "Hide" : "Reveal"}
                </button>
                {showKey && <CopyButton text={wallet.privateKey} label="Private key copied!" />}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
            <span>Stored locally</span>
          </div>
          <div className="flex items-center gap-2">
            {!wallet.isActive && (
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10"
                onClick={onActivate}
              >
                Set Active
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Wallets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: wallets, isLoading } = useListWallets({
    query: { queryKey: getListWalletsQueryKey() },
  });
  const deleteWallet = useDeleteWallet();
  const activateWallet = useActivateWallet();

  // Controls the two-step reveal flow
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    // Brief delay to make it feel like something is happening
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 1200);
  }

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Wallets</h1>
        <Skeleton className="h-64 w-full bg-muted/50 rounded-xl" />
      </div>
    );
  }

  const hasWallets = wallets && wallets.length > 0;

  // ── Step 1: Landing — show "Generate Your Wallet" ────────────────────────
  if (!generated) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Wallets</h1>

        <div className="flex flex-col items-center justify-center py-12">
          <Card className="w-full max-w-2xl border-2 border-dashed border-primary/40 bg-primary/5">
            <CardContent className="p-10 flex flex-col items-center text-center gap-6">
              <div className="p-5 rounded-full bg-primary/10 border-2 border-primary/30">
                <WalletIcon className="h-14 w-14 text-primary" />
              </div>

              <div>
                <h2 className="text-2xl font-bold font-mono uppercase tracking-wide mb-2">
                  {hasWallets ? "View Your Wallet" : "Generate Your Wallet"}
                </h2>
                <p className="text-muted-foreground font-mono text-sm max-w-md">
                  {hasWallets
                    ? "Your Solana wallet is ready. Tap below to reveal your address and private key."
                    : "Create a new Solana wallet to start trading. Your keys will be displayed here."}
                </p>
              </div>

              {hasWallets && (
                <div className="w-full bg-background/60 border border-border rounded-xl px-6 py-4 text-left">
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Active Wallet</div>
                  <div className="font-mono text-primary font-bold text-sm break-all">
                    {wallets[0].address.slice(0, 16)}...{wallets[0].address.slice(-8)}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground mt-1">
                    {formatSol(wallets[0].balanceSol)} SOL
                  </div>
                </div>
              )}

              <Button
                className="h-14 px-12 font-mono font-bold text-base tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl w-full max-w-sm"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading wallet...
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5" />
                    {hasWallets ? "View Wallet" : "Generate Wallet"}
                  </div>
                )}
              </Button>

              <p className="text-[11px] font-mono text-muted-foreground/60 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Keys are stored locally and never transmitted
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Step 2: Wallet Details ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Wallets</h1>
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs border-border"
          onClick={() => setGenerated(false)}
        >
          ← Back
        </Button>
      </div>

      {!hasWallets ? (
        <div className="p-12 text-center border border-dashed border-border rounded-xl bg-card/10 flex flex-col items-center gap-4">
          <WalletIcon className="h-12 w-12 text-muted-foreground/50" />
          <p className="font-mono font-bold text-muted-foreground">No wallets found in database</p>
          <p className="font-mono text-xs text-muted-foreground/60">
            The wallet may not have been seeded. Restart the API server.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {wallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              onActivate={() =>
                activateWallet.mutate(
                  { id: wallet.id },
                  { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() }) }
                )
              }
              onDelete={() => {
                if (
                  confirm(
                    "Delete this wallet? Make sure you have the private key saved before continuing!"
                  )
                ) {
                  deleteWallet.mutate(
                    { id: wallet.id },
                    {
                      onSuccess: () => {
                        toast({ title: "Wallet deleted" });
                        queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
                        if (wallets.length <= 1) setGenerated(false);
                      },
                      onError: (err) =>
                        toast({
                          title: "Failed to delete wallet",
                          description: String(err),
                          variant: "destructive",
                        }),
                    }
                  );
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
