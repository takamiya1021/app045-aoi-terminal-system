/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css)$': '<rootDir>/jest.setup.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        module: 'esnext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        allowJs: true,
        strict: true,
        noEmit: true,
        isolatedModules: true,
        resolveJsonModule: true,
        lib: ['dom', 'dom.iterable', 'esnext'],
        target: 'ES2020',
        paths: {
          '@/*': ['./src/*'],
        },
      },
    }],
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/tests/'],
  extensionsToTreatAsEsm: [],
};
