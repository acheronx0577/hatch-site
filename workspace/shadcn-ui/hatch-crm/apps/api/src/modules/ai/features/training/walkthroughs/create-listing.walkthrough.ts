import type { Walkthrough } from '../training-assistant.types';

export const createListingWalkthrough: Walkthrough = {
  id: 'create-listing',
  title: 'Creating Your First Listing',
  description: 'Learn how to create and publish a property listing',
  estimatedTime: '5 minutes',
  difficulty: 'beginner',

  steps: [
    {
      id: 'step-1',
      title: 'Navigate to Listings',
      description: "First, let's go to the Properties section",
      targetSelector: '[data-nav="properties"]',
      highlightType: 'pulse',
      tooltipPosition: 'right',
      expectedAction: { type: 'click', target: '[data-nav="properties"]' },
      skippable: false
    },
    {
      id: 'step-2',
      title: 'Click New Draft',
      description: 'Click the "New Draft" button to start creating',
      targetSelector: '[data-action="new-draft"]',
      highlightType: 'spotlight',
      tooltipPosition: 'bottom',
      expectedAction: { type: 'click', target: '[data-action="new-draft"]' },
      skippable: false
    },
    {
      id: 'step-3',
      title: 'Enter Property Address',
      description: 'Enter the address. Hatch will auto-populate data when available.',
      targetSelector: '[data-field="address"]',
      highlightType: 'outline',
      tooltipPosition: 'right',
      expectedAction: { type: 'input', target: '[data-field="address"]', minLength: 10 },
      skippable: false,
      practiceMode: {
        sampleData: '123 Palm Beach Blvd, Fort Myers, FL 33901'
      }
    },
    {
      id: 'step-4',
      title: 'Fill Property Details',
      description: 'Enter bedrooms, bathrooms, square footage, and price',
      targetSelector: '[data-section="property-details"]',
      highlightType: 'outline',
      tooltipPosition: 'left',
      expectedAction: { type: 'form-complete', target: '[data-section="property-details"]' },
      skippable: false
    },
    {
      id: 'step-5',
      title: 'Generate AI Description',
      description: 'Let Hatch AI write a compelling listing description',
      targetSelector: '[data-action="generate-description"]',
      highlightType: 'pulse',
      tooltipPosition: 'top',
      expectedAction: { type: 'click', target: '[data-action="generate-description"]' },
      skippable: true
    },
    {
      id: 'step-6',
      title: 'Review and Save',
      description: 'Review everything and save your draft',
      targetSelector: '[data-action="save-draft"]',
      highlightType: 'spotlight',
      tooltipPosition: 'bottom',
      expectedAction: { type: 'click', target: '[data-action="save-draft"]' },
      skippable: false
    }
  ],

  quiz: [
    {
      question: 'Where does the MLS number appear after publishing?',
      options: ['In the listing table', 'Only in MLS portal', "It's not shown"],
      correctAnswer: 0,
      explanation: 'The MLS number appears in the listing table and detail page after sync.'
    }
  ]
};

