import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  BarChart3,
  Radar,
  LineChart,
  Eye,
  Shield,
  Sparkles,
  Settings,
  Compass,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function Sidebar({ currentTab, onTabChange }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'journal', label: 'Trading Journal', icon: BookOpen },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'scanner', label: 'Market Scanner', icon: Radar },
    { id: 'pair-analysis', label: 'Pair Terminal', icon: LineChart },
    { id: 'watchlist', label: 'Watchlist', icon: Eye },
    { id: 'risk-manager', label: 'Risk Manager', icon: Shield },
    { id: 'ai-analyst', label: 'AI Analyst', icon: Sparkles, badge: 'Flash' },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col justify-between hidden md:flex shrink-0">
      <div>
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold shadow-md shadow-emerald-500/20">
            <Compass className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-base font-extrabold tracking-tight text-zinc-100 flex items-center gap-1.5">
              <span>TradePilot</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">v1.2</span>
            </div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Trading Intelligence</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-zinc-800/80 text-emerald-400 border border-zinc-700/50 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 font-mono font-semibold border border-emerald-500/20">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Terminal Footer info */}
      <div className="p-4 border-t border-zinc-900 text-xs text-zinc-400 space-y-2">
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span>Data Provider</span>
          <span className="text-emerald-400 font-medium">TWELVE DATA (REAL)</span>
        </div>
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span>Execution Engine</span>
          <span className="text-zinc-400">Research Only</span>
        </div>
        <div className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/60 text-[10px] leading-relaxed text-zinc-400">
          No automated real-money order routing. Analytical decision support.
        </div>
      </div>
    </aside>
  );
}
