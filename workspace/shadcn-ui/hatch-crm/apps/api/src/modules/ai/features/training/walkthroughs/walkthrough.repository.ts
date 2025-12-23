import type { Walkthrough, WalkthroughSummary } from '../training-assistant.types';
import { createListingWalkthrough } from './create-listing.walkthrough';

const WALKTHROUGHS: Walkthrough[] = [createListingWalkthrough];

export class WalkthroughRepository {
  list(): WalkthroughSummary[] {
    return WALKTHROUGHS.map((walkthrough) => ({
      id: walkthrough.id,
      title: walkthrough.title,
      description: walkthrough.description,
      estimatedTime: walkthrough.estimatedTime,
      difficulty: walkthrough.difficulty,
      totalSteps: walkthrough.steps.length
    }));
  }

  findByFeature(feature: string): Walkthrough | null {
    const key = (feature ?? '').trim().toLowerCase();
    if (!key) {
      return null;
    }
    return WALKTHROUGHS.find((walkthrough) => walkthrough.id.toLowerCase() === key) ?? null;
  }
}

