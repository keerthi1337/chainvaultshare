import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Home from "@/pages/home";
import Transfers from "@/pages/transfers";
import Verify from "@/pages/verify";
import Receive from "@/pages/receive";
import TransferView from "@/pages/transfer-view";
import Admin from "@/pages/admin";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Admin route — no Layout wrapper, standalone fullscreen */}
      <Route path="/admin" component={Admin} />

      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Receive} />
            <Route path="/upload" component={Home} />
            <Route path="/transfers" component={Transfers} />
            <Route path="/verify" component={Verify} />
            <Route path="/t/:id" component={TransferView} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
