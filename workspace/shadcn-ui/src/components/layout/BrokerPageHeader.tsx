import React from 'react';

type Props = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export default function BrokerPageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
