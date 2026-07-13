import { Card, CardContent } from "@/components/ui/card";
import { Zap } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center animate-in fade-in duration-500">
      <Card className="w-full max-w-md mx-4 glass-panel corner-brackets border-destructive/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 blur-3xl -z-10 rounded-full" />
        <CardContent className="pt-10 pb-8 px-8 text-center flex flex-col items-center gap-4">
          <div className="p-4 rounded-full bg-destructive/10 border border-destructive/20 mb-2">
            <Zap className="h-8 w-8 text-destructive" />
          </div>
          
          <h1 className="text-2xl font-bold italic tracking-widest uppercase text-foreground">
            System Error 404
          </h1>

          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
            The requested route does not exist in the current router configuration.
          </p>

          <Link href="/">
            <Button variant="outline" className="mt-6 font-bold text-xs tracking-widest uppercase h-10 px-6 border-border hover:bg-accent">
              Return to Core
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
