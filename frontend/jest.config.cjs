// Jest configuration for ESM and JSX support
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  extensionsToTreatAsEsm: ['.jsx'],
  transform: {
    // Use babel-jest to transform JS and JSX files
    '^.+\.(js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    // CSS and assets mock
    '\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\.(gif|ttf|eot|svg|png)$': '<rootDir>/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  testRegex: '(/src/.*|(\.|/)(test|spec))\.jsx?$',
  transformIgnorePatterns: ['/node_modules/(?!(react-router|react-router-dom)/)'],
  testEnvironmentOptions: {
    customExportConditions: [''],
  },
  globals: {
    'import.meta': {
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:8000/api'
      }
    }
  }
};
