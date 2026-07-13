import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useExecuteTrade, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ShoppingCart, Loader2, Zap } from "lucide-react";
import { TradeInputType, TradeInputPriorityFee } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const buySchema = z.object({
  contractAddress: z.string().min(32, "Invalid Solana address").max(44, "Invalid Solana address"),
  amountSol: z.coerce.number().positive("Amount must be positive"),
  slippagePercent: z.coerce.number().min(0.1).max(100),
  priorityFee: z.nativeEnum(TradeInputPriorityFee),
});

const PRESET_AMOUNTS = [0.1, 0.5, 1, 2, 5];

export default function Buy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const executeTrade = useExecuteTrade();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const form = useForm<z.infer<typeof buySchema>>({
    resolver: zodResolver(buySchema),
    defaultValues: {
      contractAddress: "",
      amountSol: settings?.defaultBuyAmountSol || 0.1,
      slippagePercent: settings?.defaultSlippagePercent || 1,
      priorityFee: (settings?.defaultPriorityFee as any) || "auto",
    },
  });

  function onSubmit(values: z.infer<typeof buySchema>) {
    executeTrade.mutate({
      data: {
        type: TradeInputType.buy,
        contractAddress: values.contractAddress,
        amountSol: values.amountSol,
        slippagePercent: values.slippagePercent,
        priorityFee: values.priorityFee,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Buy order submitted", description: `Purchasing for ${values.amountSol} SOL` });
        form.reset({ ...values, contractAddress: "" });
      },
      onError: (err) => {
        toast({ title: "Failed to execute buy", description: String(err), variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto animate-in fade-in duration-500">
      <h1 className="text-3xl font-black italic tracking-widest text-foreground uppercase flex items-center gap-3">
        <ShoppingCart className="h-6 w-6 text-primary" />
        Market Buy
      </h1>
      
      <Card className="glass-panel border-primary/30 overflow-hidden relative corner-brackets">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 blur-3xl -z-10 rounded-full" />
        <CardHeader className="p-8 border-b border-border bg-card/40">
          <CardTitle className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <Zap className="h-4 w-4" /> Instant Execution
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 relative z-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="contractAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Target Contract Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Paste Solana token address..." className=" bg-background/50 h-14 text-base border-border focus:border-primary/50 transition-colors" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="bg-background/30 p-6 rounded-xl border border-border space-y-6">
                <FormField
                  control={form.control}
                  name="amountSol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Position Size (SOL)</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" placeholder="0.00" className=" bg-background h-14 text-xl font-bold text-primary border-border focus:border-primary/50" {...field} />
                      </FormControl>
                      <div className="grid grid-cols-5 gap-3 mt-4">
                        {PRESET_AMOUNTS.map(amount => (
                          <Button
                            key={amount}
                            type="button"
                            variant="outline"
                            className=" text-xs font-bold h-10 border-border bg-background hover:bg-primary/20 hover:border-primary/50 hover:text-primary transition-colors"
                            onClick={() => form.setValue("amountSol", amount)}
                          >
                            {amount}
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="slippagePercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Slippage Tolerance (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" className=" bg-background/50 h-12 border-border focus:border-primary/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priorityFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">Network Priority</FormLabel>
                      <FormControl>
                        <select 
                          className="flex h-12 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50  font-bold transition-colors"
                          {...field}
                        >
                          <option value="auto">Auto (Dynamic)</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High (Fastest)</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-16 mt-4 font-bold text-sm tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_25px_-5px_hsl(var(--primary)/0.6)] transition-all uppercase rounded-xl"
                disabled={executeTrade.isPending}
              >
                {executeTrade.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                  <>
                    <Zap className="mr-3 h-5 w-5 fill-current" />
                    Execute Buy Order
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
