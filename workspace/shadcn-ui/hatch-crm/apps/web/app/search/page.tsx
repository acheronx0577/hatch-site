import SearchClient from '@/components/search/search-client';

const parseListParam = (value: string | string[] | undefined): string[] | undefined => {
  if (!value) return undefined;
  const list = Array.isArray(value) ? value : value.split(',');
  const cleaned = list.map((entry) => entry.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
};

export default async function SearchPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qRaw = searchParams.q;
  const q =
    typeof qRaw === 'string' ? qRaw : Array.isArray(qRaw) ? qRaw[0] ?? '' : '';

  const types = parseListParam(searchParams.types);
  const ownerId =
    typeof searchParams.ownerId === 'string'
      ? searchParams.ownerId
      : undefined;
  const stage =
    typeof searchParams.stage === 'string' ? searchParams.stage : undefined;
  const status =
    typeof searchParams.status === 'string' ? searchParams.status : undefined;

  return (
    <SearchClient
      initialFilters={{
        q: q ?? '',
        types,
        ownerId,
        stage,
        status
      }}
    />
  );
}
