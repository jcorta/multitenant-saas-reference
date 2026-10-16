module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
};
