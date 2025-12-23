import { PropertiesView } from './components/properties-view';

const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'org-hatch';

export const dynamic = 'force-dynamic';

type PropertiesDashboardPageProps = {
  searchParams?: {
    filter?: string;
  };
};

export default function PropertiesDashboardPage({ searchParams }: PropertiesDashboardPageProps) {
  const filterParam = searchParams?.filter?.toUpperCase();
  const initialFilter =
    filterParam === 'ACTIVE' ||
    filterParam === 'PENDING' ||
    filterParam === 'EXPIRING' ||
    filterParam === 'FLAGGED' ||
    filterParam === 'ALL'
      ? filterParam
      : undefined;

  return <PropertiesView orgId={DEFAULT_ORG_ID} initialFilter={initialFilter} />;
}
