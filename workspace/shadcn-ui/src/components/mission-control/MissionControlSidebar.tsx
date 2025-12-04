import React from 'react';

interface MissionControlSidebarProps {
  securityAudit: React.ReactNode;
  activityFeed: React.ReactNode;
}

export const MissionControlSidebar: React.FC<MissionControlSidebarProps> = ({
  securityAudit,
  activityFeed
}) => {
  return (
    <div className="flex flex-col gap-4">
      {securityAudit}
      {activityFeed}
    </div>
  );
};
