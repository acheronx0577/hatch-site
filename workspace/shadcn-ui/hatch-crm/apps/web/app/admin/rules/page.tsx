export const dynamic = 'force-dynamic';

export default function AdminRulesIndexPage() {
  return (
    <div className="space-y-4 p-6 text-sm text-slate-600">
      <p>Select a tab above to manage validation or assignment rules.</p>
      <p className="text-slate-500">
        Validation rules enforce required fields or guard updates. Assignment rules determine owner or queue targets on create/update events.
      </p>
    </div>
  );
}
