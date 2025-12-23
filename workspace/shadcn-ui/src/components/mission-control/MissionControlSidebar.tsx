import React from 'react';

interface MissionControlSidebarProps {
  activityFeed: React.ReactNode;
  securityAudit?: React.ReactNode;
}

export const MissionControlSidebar: React.FC<MissionControlSidebarProps> = ({
  securityAudit,
  activityFeed
}) => {
  return (
    <div className="flex flex-col gap-6">
      {securityAudit ? <>{securityAudit}</> : null}
      {activityFeed}
    </div>
  );
};
