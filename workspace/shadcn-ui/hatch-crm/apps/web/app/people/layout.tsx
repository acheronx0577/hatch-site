import type { ReactNode } from 'react';

export default function PeopleLayout({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-10">{children}</div>;
}
