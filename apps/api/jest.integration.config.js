module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\.int-spec\.ts$',
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30000,
};
