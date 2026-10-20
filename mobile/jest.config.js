/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // The first render of a React Native module is slow on a cold cache (Windows especially).
  testTimeout: 20000,
};
