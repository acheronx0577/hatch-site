import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CreateLeadPayload, Pipeline } from '@/lib/api/hatch';

type OwnerOption = {
  id: string;
  name: string;
};

type AddLeadModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelines: Pipeline[];
  owners: OwnerOption[];
  defaultPipelineId?: string;
  onCreate: (payload: CreateLeadPayload & { notes?: string }) => Promise<void> | void;
};

const DEFAULT_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  source: '',
  ownerId: '',
  leadType: 'UNKNOWN',
  pipelineId: '',
  stageId: '',
  notes: '',
  consentEmail: true,
  consentSMS: false
};

export function AddLeadModal({
  open,
  onOpenChange,
  pipelines,
  owners,
  defaultPipelineId,
  onCreate
}: AddLeadModalProps) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const firstPipelineId = pipelines[0]?.id ?? '';
  const currentPipeline = useMemo(() => {
    return pipelines.find((pipeline) => pipeline.id === form.pipelineId) ?? pipelines.find((p) => p.id === defaultPipelineId) ?? pipelines[0] ?? null;
  }, [defaultPipelineId, form.pipelineId, pipelines]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);
    setForm((prev) => {
    const pipelineId = prev.pipelineId || defaultPipelineId || firstPipelineId;
    const pipeline = pipelines.find((pipe) => pipe.id === pipelineId);
    const stageId = pipeline?.stages[0]?.id ?? '';
      return {
        ...prev,
        pipelineId,
        stageId
      };
    });
  }, [defaultPipelineId, firstPipelineId, open, pipelines]);

  const handleChange = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.firstName.trim() && !form.lastName.trim()) {
      nextErrors.firstName = 'Provide a first or last name';
      nextErrors.lastName = 'Provide a first or last name';
    }
    if (!form.email.trim() && !form.phone.trim()) {
      nextErrors.email = 'Email or phone required';
      nextErrors.phone = 'Email or phone required';
    }
    if (!form.pipelineId) {
      nextErrors.pipelineId = 'Select a pipeline';
    }
    if (!form.stageId) {
      nextErrors.stageId = 'Select a stage';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const submission = {
        ...form,
        ownerId: form.ownerId?.trim() ? form.ownerId : undefined
      };
      await onCreate(submission);
      setForm((prev) => ({
        ...DEFAULT_FORM,
        pipelineId: prev.pipelineId,
        stageId: prev.stageId
      }));
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add lead';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePipelineChange = (pipelineId: string) => {
    const pipeline = pipelines.find((pipe) => pipe.id === pipelineId);
    handleChange('pipelineId', pipelineId);
    handleChange('stageId', pipeline?.stages[0]?.id ?? '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
          <DialogDescription>Capture a new buyer or seller and drop them in the right spot.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input value={form.firstName} onChange={(event) => handleChange('firstName', event.target.value)} />
              {errors.firstName && <p className="text-xs text-red-600">{errors.firstName}</p>}
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input value={form.lastName} onChange={(event) => handleChange('lastName', event.target.value)} />
              {errors.lastName && <p className="text-xs text-red-600">{errors.lastName}</p>}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(event) => handleChange('email', event.target.value)} placeholder="lead@email.com" />
              {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(event) => handleChange('phone', event.target.value)} placeholder="(555) 123-4567" />
              {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Representing Licensee</Label>
              <Select value={form.ownerId || 'unassigned'} onValueChange={(value) => handleChange('ownerId', value === 'unassigned' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lead type</Label>
              <Select value={form.leadType} onValueChange={(value) => handleChange('leadType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unknown" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                  <SelectItem value="BUYER">Buyer</SelectItem>
                  <SelectItem value="SELLER">Seller</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Input value={form.source} onChange={(event) => handleChange('source', event.target.value)} placeholder="Zillow, Open house, Referral…" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select value={form.pipelineId} onValueChange={handlePipelineChange}>
                <SelectTrigger className={errors.pipelineId ? 'ring-1 ring-red-500' : undefined}>
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.pipelineId && <p className="text-xs text-red-600">{errors.pipelineId}</p>}
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={form.stageId} onValueChange={(value) => handleChange('stageId', value)}>
                <SelectTrigger className={errors.stageId ? 'ring-1 ring-red-500' : undefined}>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {currentPipeline?.stages?.length ? (
                    currentPipeline.stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__placeholder__" disabled>
                      No stages
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.stageId && <p className="text-xs text-red-600">{errors.stageId}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(event) => handleChange('notes', event.target.value)} placeholder="Context for your team…" rows={3} />
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Checkbox checked={form.consentEmail} onCheckedChange={(checked) => handleChange('consentEmail', Boolean(checked))} />
              Email consent captured
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Checkbox checked={form.consentSMS} onCheckedChange={(checked) => handleChange('consentSMS', Boolean(checked))} />
              SMS consent captured
            </label>
          </div>
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddLeadModal;
