import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthCallback, AuthGate, LoginPage } from "@/components/AuthGate";
import { isLoginRequired } from "@/lib/authMode";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CustomerHandover from "./pages/CustomerHandover";
import AtinnHandover from "./pages/AtinnHandover";
import Home from "./pages/Home";
import ShowOnDaysPage from "./pages/ShowOnDaysPage";

function AppRoutes() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/login">
        <Redirect to="/" />
      </Route>
      <Route path="/auth/callback">
        <Redirect to="/" />
      </Route>
      <Route path={"/"} component={Home} />
      <Route path={"/customers"} component={CustomerHandover} />
      <Route path={"/atinn-handover"} component={AtinnHandover} />
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
          <Toaster />
          {isLoginRequired ? (
            <Switch>
              <Route path="/login" component={LoginPage} />
              <Route path="/auth/callback" component={AuthCallback} />
              <Route>
                <AuthGate>
                  <AppRoutes />
                </AuthGate>
              </Route>
            </Switch>
          ) : (
            <AppRoutes />
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
