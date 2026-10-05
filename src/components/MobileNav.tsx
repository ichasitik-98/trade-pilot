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
} from 'lucide-react';

interface MobileNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function MobileNav({ currentTab, onTabChange }: MobileNavProps) {
  const tabs = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'scanner', label: 'Scanner', icon: Radar },
    { id: 'pair-analysis', label: 'Terminal', icon: LineChart },
    { id: 'watchlist', label: 'Watchlist', icon: Eye },
    { id: 'risk-manager', label: 'Risk', icon: Shield },
    { id: 'ai-analyst', label: 'AI', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 border-t border-zinc-800 backdrop-blur-lg px-2 py-1.5 flex items-center justify-between overflow-x-auto gap-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center min-w-[54px] py-1 px-1 rounded-lg text-[10px] font-medium transition shrink-0 ${
              isActive ? 'text-emerald-400 font-bold bg-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon className="w-4 h-4 mb-0.5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
