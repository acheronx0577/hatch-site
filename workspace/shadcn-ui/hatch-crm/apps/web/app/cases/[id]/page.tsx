import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getCase, listCaseFiles } from '@/lib/api/cases';

export const dynamic = 'force-dynamic';

interface CaseDetailPageProps {
  params: { id: string };
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  try {
    const [record, files] = await Promise.all([getCase(params.id), listCaseFiles(params.id)]);

    return (
      <div className="space-y-6">
        <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{record.subject}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Status {record.status ?? '—'} · Priority {record.priority ?? '—'} · Origin{' '}
            {record.origin ?? '—'}
          </p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Details</h2>
          <dl className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</dt>
              <dd>
                {record.account ? (
                  <Link href={`/accounts/${record.account.id}`} className="text-brand-600 hover:underline">
                    {record.account.name}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</dt>
              <dd>
                {record.contact ? (
                  <>
                    {record.contact.name ?? 'Contact'}{' '}
                    {record.contact.email && (
                      <span className="text-xs text-slate-400">({record.contact.email})</span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</dt>
              <dd>{record.ownerId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</dt>
              <dd>{record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—'}</dd>
            </div>
          </dl>

          <div className="mt-4 text-sm text-slate-600">
            <h3 className="text-sm font-semibold text-slate-700">Description</h3>
            <p className="mt-2 whitespace-pre-wrap">
              {record.description ?? 'No description provided.'}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Files</h2>
          {files.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No files linked yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {files.map((link) => (
                <li key={link.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="font-medium text-slate-800">{link.file?.name ?? link.fileId}</span>
                  {link.file?.mimeType && (
                    <span className="ml-2 text-xs uppercase text-slate-400">{link.file.mimeType}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Use the Files panel to upload documents and link them to this case.
          </p>
        </section>
      </div>
    );
  } catch {
    notFound();
  }
}
