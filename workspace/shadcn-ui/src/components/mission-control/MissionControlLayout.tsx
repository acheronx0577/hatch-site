import React from 'react';

interface MissionControlLayoutProps {
  header: React.ReactNode;
  kpis: React.ReactNode;
  modules: React.ReactNode;
  sidebar: React.ReactNode;
}

export const MissionControlLayout: React.FC<MissionControlLayoutProps> = ({
  header,
  kpis,
  modules,
  sidebar
}) => {
  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex flex-col gap-6">
          {kpis}
          {modules}
        </div>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
          {sidebar}
        </aside>
      </div>
    </div>
  );
};
