import type { OpenAPIObject } from '@nestjs/swagger';

export function buildTaggedSpec(spec: OpenAPIObject): OpenAPIObject {
  const tagSet = new Set<string>();
  const paths = spec.paths ?? {};

  for (const pathItem of Object.values(paths)) {
    if (!pathItem) continue;
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== 'object') continue;
      const opTags = (operation as any).tags as string[] | undefined;
      if (Array.isArray(opTags)) {
        for (const tag of opTags) {
          if (typeof tag === 'string' && tag.trim().length > 0) {
            tagSet.add(tag);
          }
        }
      }
    }
  }

  const tags = Array.from(tagSet)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name }));

  if (tags.length === 0) {
    const { tags: _existing, ...rest } = spec;
    return { ...rest };
  }

  return {
    ...spec,
    tags
  };
}
