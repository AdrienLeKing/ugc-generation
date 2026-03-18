"use client";

import { useT } from "@/lib/i18n/context";

export type TabId = "make" | "media" | "persona" | "settings";

type TabDef = {
  id: TabId;
  icon: React.ReactNode;
};

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const TABS: TabDef[] = [
  {
    id: "make",
    icon: <Icon d="M12 5v14M5 12h14" />,
  },
  {
    id: "media",
    icon: <Icon d="M5 3l14 9-14 9V3z" />,
  },
  {
    id: "persona",
    icon: <Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />,
  },
  {
    id: "settings",
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const TAB_LABELS: Record<TabId, (t: ReturnType<typeof useT>) => string> = {
  make: () => "MakeUGC",
  media: (t) => t.nav.media,
  persona: () => "Persona",
  settings: (t) => t.nav.settings,
};

export function BottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  const t = useT();

  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            className={`bottom-nav-item ${isActive ? "is-active" : ""}`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span className="bottom-nav-label">{TAB_LABELS[tab.id](t)}</span>
          </button>
        );
      })}
    </nav>
  );
}
