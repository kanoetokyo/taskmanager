import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthCallback, AuthGate, LoginPage } from "@/components/AuthGate";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import SakuraPetals from "./components/SakuraPetals";
import { ThemeProvider } from "./contexts/ThemeContext";
import CustomerHandover from "./pages/CustomerHandover";
import Home from "./pages/Home";
import ShowOnDaysPage from "./pages/ShowOnDaysPage";

function AppRoutes() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/customers"} component={CustomerHandover} />
      <Route path={"/show-on-days"} component={ShowOnDaysPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <SakuraPetals />
          <Toaster />
          <Switch>
            <Route path="/login" component={LoginPage} />
            <Route path="/auth/callback" component={AuthCallback} />
            <Route>
              <AuthGate>
                <AppRoutes />
              </AuthGate>
            </Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
