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
import { ShoppingCart, Loader2 } from "lucide-react";
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
        // Invalidate relevant queries
      },
      onError: (err) => {
        toast({ title: "Failed to execute buy", description: String(err), variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold font-mono tracking-tight uppercase">Buy Token</h1>
      
      <Card className="bg-card/50 border-border">
        <CardHeader className="p-6 border-b border-border/50">
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Quick Buy</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="contractAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase">Contract Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Token address..." className="font-mono bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amountSol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase">Amount (SOL)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="0.00" className="font-mono bg-background" {...field} />
                    </FormControl>
                    <div className="grid grid-cols-5 gap-2 mt-2">
                      {PRESET_AMOUNTS.map(amount => (
                        <Button
                          key={amount}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-mono text-xs h-8 border-border"
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="slippagePercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Slippage (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" className="font-mono bg-background" {...field} />
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
                      <FormLabel className="font-mono text-xs uppercase">Priority Fee</FormLabel>
                      <FormControl>
                        <select 
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                          {...field}
                        >
                          <option value="auto">Auto</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 mt-4 font-mono font-bold tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={executeTrade.isPending}
              >
                {executeTrade.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    EXECUTE BUY
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
