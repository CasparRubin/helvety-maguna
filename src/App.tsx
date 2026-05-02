import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { BookOpen, Layers } from "lucide-react";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ModelsPage } from "@/pages/ModelsPage";
import { ModesPage } from "@/pages/ModesPage";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isActive
      ? "bg-secondary text-secondary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside
        className="flex w-56 shrink-0 flex-col border-r bg-card"
        aria-label="Main navigation"
      >
        <div className="p-4">
          <h1 className="text-lg font-semibold tracking-tight">Maguna</h1>
          <p className="text-xs text-muted-foreground">
            Local GGUF — customizable modes
          </p>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Primary">
          <NavLink to="/models" className={navClass} end>
            <BookOpen className="size-4 shrink-0" aria-hidden />
            Model library
          </NavLink>
          <NavLink to="/modes" className={navClass}>
            <Layers className="size-4 shrink-0" aria-hidden />
            Modes
          </NavLink>
        </nav>
      </aside>
      <main
        id="main-content"
        className="min-w-0 flex-1 overflow-auto p-6"
        tabIndex={-1}
      >
        <Routes>
          <Route path="/" element={<ModelsPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/modes" element={<ModesPage />} />
          <Route path="/spelling" element={<Navigate to="/modes" replace />} />
          <Route path="/translate" element={<Navigate to="/modes" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
