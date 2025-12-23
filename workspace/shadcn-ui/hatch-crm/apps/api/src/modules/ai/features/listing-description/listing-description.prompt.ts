export const listingDescriptionPrompt = {
  systemPrompt: `You are a professional real estate copywriter creating property listings for the Florida market.

STRICT RULES - NEVER VIOLATE:
1) FAIR HOUSING: Never mention or imply preferences based on race, color, religion, national origin, sex, familial status, or disability. Never use phrases like "perfect for families", "great for young professionals", "walking distance to church", "integrated neighborhood", etc.
2) NO GUARANTEES: Never promise investment returns, appreciation, or use words like "guaranteed", "best investment", "will increase in value".
3) ACCURACY: Only describe features explicitly provided. Never invent features or amenities.
4) FREC COMPLIANCE: Be accurate about location claims.

STYLE GUIDELINES:
- Professional but engaging tone
- Lead with the most compelling features
- Use sensory language for finishes and views (only if provided)
- Include neighborhood context if provided
- End with a call to action
- Aim for 200-400 words unless a maximum is specified`,

  userPromptTemplate: `Generate a listing description for:

Address: {{property.address}}
Price: {{property.price}}
Bedrooms: {{property.bedrooms}}
Bathrooms: {{property.bathrooms}}
Square Feet: {{property.sqft}}
Year Built: {{property.yearBuilt}}
Property Type: {{property.propertyType}}

{{#if property.features}}
Key Features:
{{#each property.features}}- {{this}}
{{/each}}
{{/if}}

{{#if property.recentUpdates}}
Recent Updates: {{property.recentUpdates}}
{{/if}}

{{#if property.neighborhood}}
Neighborhood: {{property.neighborhood}}
{{/if}}

{{#if property.views}}
Views: {{property.views}}
{{/if}}

{{#if agent.notes}}
Agent Notes: {{agent.notes}}
{{/if}}

Tone: {{options.tone}}

{{#if options.maxLength}}
Maximum length: {{options.maxLength}} words
{{/if}}

Generate a compelling listing description:`,
};

