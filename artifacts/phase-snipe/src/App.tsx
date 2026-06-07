import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Buy from "@/pages/buy";
import Sell from "@/pages/sell";
import Snipe from "@/pages/snipe";
import Portfolio from "@/pages/portfolio";
import Wallets from "@/pages/wallets";
import CopyTrade from "@/pages/copy-trade";
import LimitOrders from "@/pages/limit-orders";
import Dca from "@/pages/dca";
import Settings from "@/pages/settings";
import Notifications from "@/pages/notifications";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Layout><Dashboard /></Layout>} />
      <Route path="/buy" component={() => <Layout><Buy /></Layout>} />
      <Route path="/sell" component={() => <Layout><Sell /></Layout>} />
      <Route path="/snipe" component={() => <Layout><Snipe /></Layout>} />
      <Route path="/portfolio" component={() => <Layout><Portfolio /></Layout>} />
      <Route path="/wallets" component={() => <Layout><Wallets /></Layout>} />
      <Route path="/copy-trade" component={() => <Layout><CopyTrade /></Layout>} />
      <Route path="/limit-orders" component={() => <Layout><LimitOrders /></Layout>} />
      <Route path="/dca" component={() => <Layout><Dca /></Layout>} />
      <Route path="/settings" component={() => <Layout><Settings /></Layout>} />
      <Route path="/notifications" component={() => <Layout><Notifications /></Layout>} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
