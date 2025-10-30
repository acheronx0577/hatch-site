import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: './',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    }
  },
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@hatch/db$': '<rootDir>/../../packages/db/src/index.ts',
    '^@hatch/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@hatch/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1.ts',
    '^@hatch/config$': '<rootDir>/../../packages/config/src',
    '^@app/(.*)$': '<rootDir>/src/$1'
  }
};

export default config;
