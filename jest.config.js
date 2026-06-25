module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "ts-jest",
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^obsidian$": "<rootDir>/__mocks__/obsidian.js",
    // The yaml package's "exports" field defaults to a browser ESM entry under
    // jsdom; Jest can't parse ESM without extra config, so point at the CJS
    // build it ships under dist/.
    "^yaml$": "<rootDir>/node_modules/yaml/dist/index.js",
    // pdf.js ships ESM with `import.meta`, which Jest can't parse. Stub it for
    // tests; real PDF extraction is covered by the build + manual verification.
    "^pdfjs-dist/legacy/build/pdf\\.mjs$": "<rootDir>/__mocks__/pdfjs.js",
    "^pdfjs-dist/legacy/build/pdf\\.worker\\.mjs$": "<rootDir>/__mocks__/pdfjs-worker.js",
  },
  testRegex: ".*\\.test\\.(jsx?|tsx?)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testPathIgnorePatterns: ["/node_modules/"],
  setupFiles: ["<rootDir>/jest.setup.js"],
};
