/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // TypeScript + ESM (backend is "type": "module")
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '\\.d\\.ts$'],
  moduleNameMapper: {
    // ts-jest + NodeNext で `./foo.js` import を `./foo.ts` に解決する
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

