export const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

export const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

export const itIf = (condition: boolean) => (condition ? it : it.skip);
