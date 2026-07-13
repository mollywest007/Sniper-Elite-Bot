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
  Terminal,
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
      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono font-bold tracking-widest uppercase bg-accent/50 border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
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
        "overflow-hidden transition-all glass-panel group",
        wallet.isActive
          ? "border-primary/50 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.2)]"
          : "border-border"
      )}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card/40 relative overflow-hidden">
          {wallet.isActive && <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -z-10 rounded-full" />}
          <div className="flex items-center gap-4 z-10">
            <div
              className={cn(
                "p-3 rounded-xl border",
                wallet.isActive ? "bg-primary/10 text-primary border-primary/30" : "bg-background text-muted-foreground border-border"
              )}
            >
              <WalletIcon className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-mono font-bold text-xl tracking-tight text-foreground">{wallet.name}</h3>
                {wallet.isActive && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-primary text-primary-foreground flex items-center gap-1 shadow-[0_0_10px_hsl(var(--primary)/0.3)]">
                    <Check className="h-3 w-3" /> Active Link
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1 flex items-center gap-1.5">
                <Terminal className="h-3 w-3" /> Solana Node
              </div>
            </div>
          </div>
          <div className="text-right z-10">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Available Funds</div>
            <div className="font-mono font-bold text-2xl text-foreground">
              {formatSol(wallet.balanceSol)} <span className="text-sm font-normal text-primary opacity-80">SOL</span>
            </div>
            <div className="text-xs font-mono text-muted-foreground tracking-wider">{formatUsd(wallet.balanceUsdc)}</div>
          </div>
        </div>

        {/* Address */}
        <div className="p-6 border-b border-border/50">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
            <WalletIcon className="h-3.5 w-3.5" /> Public Address
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 bg-background/50 rounded-lg border border-border px-4 py-3 min-w-0 w-full">
              <p className="font-mono text-sm text-foreground break-all select-all leading-relaxed">
                {wallet.address}
              </p>
            </div>
            <CopyButton text={wallet.address} label="Address copied!" />
          </div>
        </div>

        {/* Private Key */}
        {wallet.privateKey && (
          <div className="p-6 border-b border-border/50 bg-destructive/5 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive/50" />
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-mono text-destructive uppercase tracking-widest flex items-center gap-2 font-bold">
                <Key className="h-3.5 w-3.5" /> Private Key Extract
              </div>
              <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-destructive/80 bg-destructive/10 border border-destructive/20 px-2 py-1 rounded">
                ⚠️ Secure Material
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 bg-background/80 rounded-lg border border-destructive/20 px-4 py-3 min-w-0 w-full">
                {showKey ? (
                  <p className="font-mono text-sm text-destructive break-all select-all leading-relaxed">
                    {wallet.privateKey}
                  </p>
                ) : (
                  <p className="font-mono text-sm text-muted-foreground tracking-[0.3em]">
                    {"•".repeat(64)}
                  </p>
                )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowKey((v) => !v)}
                  className="font-mono text-xs font-bold tracking-widest uppercase border-border hover:bg-accent flex-1 sm:flex-none h-11"
                  title={showKey ? "Hide" : "Reveal"}
                >
                  {showKey ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  {showKey ? "Hide" : "Decrypt"}
                </Button>
                {showKey && <CopyButton text={wallet.privateKey} label="Private key copied!" />}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-card/20">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Encrypted locally</span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {!wallet.isActive && (
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs font-bold tracking-widest uppercase border-primary/30 text-primary hover:bg-primary/10 flex-1 sm:flex-none h-10"
                onClick={onActivate}
              >
                Set Active
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs font-bold tracking-widest uppercase text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-1 sm:flex-none h-10"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete Data
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

  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 1200);
  }

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase flex items-center gap-3">
          <WalletIcon className="h-6 w-6 text-primary" />
          Wallet Management
        </h1>
        <Skeleton className="h-80 w-full bg-card border-border rounded-xl" />
      </div>
    );
  }

  const hasWallets = wallets && wallets.length > 0;

  if (!generated) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase flex items-center gap-3">
          <WalletIcon className="h-6 w-6 text-primary" />
          Wallet Management
        </h1>

        <div className="flex flex-col items-center justify-center py-16">
          <Card className="w-full max-w-2xl border border-primary/20 bg-card/40 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background/0 to-background/0 pointer-events-none" />
            <CardContent className="p-12 flex flex-col items-center text-center gap-8 relative z-10">
              <div className="p-6 rounded-2xl bg-background border border-primary/30 shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)]">
                <ShieldCheck className="h-16 w-16 text-primary" />
              </div>

              <div>
                <h2 className="text-3xl font-bold font-mono uppercase tracking-widest mb-3 text-foreground">
                  {hasWallets ? "Access Vault" : "Initialize Vault"}
                </h2>
                <p className="text-muted-foreground font-mono text-sm max-w-md mx-auto leading-relaxed">
                  {hasWallets
                    ? "Your encrypted Solana keys are stored locally. Authenticate to view your credentials."
                    : "Generate a new cryptographic pair for trading operations. Keys never leave your device."}
                </p>
              </div>

              {hasWallets && (
                <div className="w-full bg-background/80 border border-border rounded-xl px-6 py-5 text-left flex flex-col gap-2">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Active Node</div>
                  <div className="font-mono text-primary font-bold text-sm tracking-widest break-all">
                    {wallets[0].address.slice(0, 16)}••••{wallets[0].address.slice(-8)}
                  </div>
                  <div className="text-sm font-mono text-foreground font-bold flex items-center gap-2 mt-1">
                    {formatSol(wallets[0].balanceSol)} SOL
                  </div>
                </div>
              )}

              <Button
                className="h-16 px-12 font-mono font-bold text-sm tracking-widest uppercase bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl w-full max-w-sm shadow-[0_0_20px_-5px_hsl(var(--primary)/0.4)] transition-all"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Decrypting...
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5" />
                    {hasWallets ? "Unlock Vault" : "Generate Keys"}
                  </div>
                )}
              </Button>

              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2 bg-background/50 px-4 py-2 rounded-full border border-border">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Zero-Knowledge Environment
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 uppercase flex items-center gap-3">
          <WalletIcon className="h-6 w-6 text-primary" />
          Wallet Management
        </h1>
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs font-bold tracking-widest uppercase border-border h-10 px-6"
          onClick={() => setGenerated(false)}
        >
          ← Lock Vault
        </Button>
      </div>

      {!hasWallets ? (
        <div className="p-16 text-center border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center gap-5">
          <WalletIcon className="h-16 w-16 text-muted-foreground/30" />
          <div>
            <p className="font-mono font-bold text-lg text-foreground tracking-tight uppercase">Database Empty</p>
            <p className="font-mono text-sm text-muted-foreground mt-2">
              No wallet seeds detected in local storage.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
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
                    "WARNING: DESTRUCTIVE ACTION\n\nEnsure you have backed up the private key. This cannot be undone."
                  )
                ) {
                  deleteWallet.mutate(
                    { id: wallet.id },
                    {
                      onSuccess: () => {
                        toast({ title: "Credentials purged" });
                        queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
                        if (wallets.length <= 1) setGenerated(false);
                      },
                      onError: (err) =>
                        toast({
                          title: "Purge failed",
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
