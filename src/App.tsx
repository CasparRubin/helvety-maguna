import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import {
  BookOpen,
  Languages,
  MessageSquare,
  Sparkles,
  SpellCheck2,
} from "lucide-react";

import { ModesNavProvider, useModesNav } from "@/context/modes-nav-context";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemePreferenceRow } from "@/components/ThemePreferenceRow";
import { ModelsPage } from "@/pages/ModelsPage";
import { AddModeNavButton, ModePage } from "@/pages/ModePage";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isActive
      ? "bg-secondary text-secondary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function modeNavIcon(modeId: string) {
  if (modeId === "chat") {
    return <MessageSquare className="size-4 shrink-0" aria-hidden />;
  }
  if (modeId.startsWith("correction-")) {
    return <SpellCheck2 className="size-4 shrink-0" aria-hidden />;
  }
  if (modeId.startsWith("translate-")) {
    return <Languages className="size-4 shrink-0" aria-hidden />;
  }
  return <Sparkles className="size-4 shrink-0" aria-hidden />;
}

function AppShell() {
  const { modes } = useModesNav();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside
        className="flex w-60 shrink-0 flex-col border-r bg-card"
        aria-label="Main navigation"
      >
        <div className="p-4 text-center">
          <img
            src="/helvety_logo.svg"
            alt="Helvety logo"
            className="mb-2 block h-auto w-full"
          />
          <h1 className="text-3xl font-bold tracking-tight">Maguna</h1>
          <p className="text-xs text-muted-foreground">On-Device AI</p>
        </div>
        <Separator />
        <nav
          className="flex flex-1 flex-col gap-1 overflow-hidden p-2"
          aria-label="Primary"
        >
          <NavLink to="/models" className={navClass}>
            <BookOpen className="size-4 shrink-0" aria-hidden />
            Model library
          </NavLink>
          <Separator className="my-2" />
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Modes
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {modes.map((m) => (
              <NavLink key={m.id} to={`/mode/${m.id}`} className={navClass}>
                {modeNavIcon(m.id)}
                <span className="truncate">{m.name}</span>
              </NavLink>
            ))}
          </div>
          <div className="mt-2 flex shrink-0 flex-col gap-3 border-t pt-3">
            <AddModeNavButton />
            <ThemePreferenceRow />
          </div>
        </nav>
      </aside>
      <main id="main-content" className="min-w-0 flex-1 overflow-hidden" tabIndex={-1}>
        <ScrollArea className="h-full w-full">
          <div className="p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/mode/chat" replace />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/mode/:modeId" element={<ModePage />} />
              <Route path="/modes" element={<Navigate to="/mode/chat" replace />} />
              <Route path="/spelling" element={<Navigate to="/mode/chat" replace />} />
              <Route
                path="/translate"
                element={<Navigate to="/mode/translate-de-en" replace />}
              />
            </Routes>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function App() {
  return (
    <ModesNavProvider>
      <AppShell />
    </ModesNavProvider>
  );
}

export default App;
