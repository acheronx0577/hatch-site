import { SetMetadata } from '@nestjs/common';

export const PERMIT_METADATA_KEY = 'platform:permit';

export type PermitAction = 'create' | 'read' | 'update' | 'delete';

export interface PermitMetadata {
  object: string;
  action: PermitAction;
}

export const Permit = (object: string, action: PermitAction) =>
  SetMetadata<string, PermitMetadata>(PERMIT_METADATA_KEY, { object, action });
