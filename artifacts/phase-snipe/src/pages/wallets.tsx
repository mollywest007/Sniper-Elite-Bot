import { 
  useListWallets, 
  getListWalletsQueryKey, 
  useCreateWallet, 
  useImportWallet, 
  useUpdateWallet, 
  useDeleteWallet, 
  useActivateWallet 
} from "@workspace/api-client-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet as WalletIcon, Check, Copy, MoreVertical, Trash2, Key, Plus, Loader2 } from "lucide-react";
import { formatSol, formatUsd, cn, truncateAddress } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const createWalletSchema = z.object({
  name: z.string().min(1, "Name is required").max(30),
});

const importWalletSchema = z.object({
  name: z.string().min(1, "Name is required").max(30),
  privateKey: z.string().min(64, "Invalid private key"),
});

export default function Wallets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: wallets, isLoading } = useListWallets({ query: { queryKey: getListWalletsQueryKey() } });
  
  const createWallet = useCreateWallet();
  const importWallet = useImportWallet();
  const deleteWallet = useDeleteWallet();
  const activateWallet = useActivateWallet();

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const createForm = useForm<z.infer<typeof createWalletSchema>>({
    resolver: zodResolver(createWalletSchema),
    defaultValues: { name: "" },
  });

  const importForm = useForm<z.infer<typeof importWalletSchema>>({
    resolver: zodResolver(importWalletSchema),
    defaultValues: { name: "", privateKey: "" },
  });

  function onCreateSubmit(values: z.infer<typeof createWalletSchema>) {
    createWallet.mutate({ data: { name: values.name } }, {
      onSuccess: () => {
        toast({ title: "Wallet created" });
        createForm.reset();
        setCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
      },
      onError: (err) => toast({ title: "Failed to create wallet", description: String(err), variant: "destructive" })
    });
  }

  function onImportSubmit(values: z.infer<typeof importWalletSchema>) {
    importWallet.mutate({ data: { name: values.name, privateKey: values.privateKey } }, {
      onSuccess: () => {
        toast({ title: "Wallet imported" });
        importForm.reset();
        setImportOpen(false);
        queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() });
      },
      onError: (err) => toast({ title: "Failed to import wallet", description: String(err), variant: "destructive" })
    });
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Address copied", duration: 2000 });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Wallet Manager</h1>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="font-mono text-xs border-border">
                <Key className="h-4 w-4 mr-2" /> Import Wallet
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase">Import Private Key</DialogTitle>
              </DialogHeader>
              <Form {...importForm}>
                <form onSubmit={importForm.handleSubmit(onImportSubmit)} className="space-y-4 mt-4">
                  <FormField
                    control={importForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Wallet Name</FormLabel>
                        <FormControl>
                          <Input className="font-mono bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={importForm.control}
                    name="privateKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Private Key (base58 or array)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" className="font-mono bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full font-mono bg-primary text-primary-foreground hover:bg-primary/90" disabled={importWallet.isPending}>
                    {importWallet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import Wallet"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> New Wallet
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase">Generate New Wallet</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 mt-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Wallet Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Main Trading" className="font-mono bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full font-mono bg-primary text-primary-foreground hover:bg-primary/90" disabled={createWallet.isPending}>
                    {createWallet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Wallet"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full bg-muted/50 rounded-md" />
            <Skeleton className="h-28 w-full bg-muted/50 rounded-md" />
          </div>
        ) : !wallets || wallets.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border rounded-md bg-card/10 flex flex-col items-center gap-4">
            <WalletIcon className="h-12 w-12 text-muted-foreground/50" />
            <div className="font-mono font-bold">No wallets found</div>
          </div>
        ) : (
          wallets.map((wallet) => (
            <Card 
              key={wallet.id} 
              className={cn(
                "border overflow-hidden transition-all",
                wallet.isActive ? "border-primary bg-primary/5" : "border-border bg-card/30"
              )}
            >
              <div className="p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex gap-4 items-center">
                  <div className={cn(
                    "p-3 rounded-full shrink-0",
                    wallet.isActive ? "bg-primary/20 text-primary" : "bg-accent text-muted-foreground"
                  )}>
                    <WalletIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-mono font-bold text-lg">{wallet.name}</h3>
                      {wallet.isActive && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary text-primary-foreground flex items-center gap-1">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">{truncateAddress(wallet.address)}</span>
                      <button 
                        onClick={() => copyToClipboard(wallet.address)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto gap-6 sm:gap-8 bg-background/50 sm:bg-transparent p-3 sm:p-0 rounded-md border border-border sm:border-0">
                  <div className="text-right">
                    <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Balance</div>
                    <div className="font-mono font-bold text-lg">{formatSol(wallet.balanceSol)} <span className="text-sm font-normal text-muted-foreground">SOL</span></div>
                    <div className="text-xs font-mono text-muted-foreground">{formatUsd(wallet.balanceUsdc)}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!wallet.isActive && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => activateWallet.mutate({ id: wallet.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() }) })}
                        disabled={activateWallet.isPending}
                      >
                        Activate
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 font-mono text-xs">
                        <DropdownMenuItem onClick={() => copyToClipboard(wallet.address)}>
                          Copy Address
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this wallet? Make sure you have the private key backed up!")) {
                              deleteWallet.mutate({ id: wallet.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWalletsQueryKey() }) });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
