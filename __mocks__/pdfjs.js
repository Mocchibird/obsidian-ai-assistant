// Jest stub for pdfjs-dist (the real ESM build uses `import.meta`, which Jest
// can't parse). PDF text extraction is verified via the production build and
// manual testing, not unit tests.
module.exports = {
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 0,
      getPage: async () => ({ getTextContent: async () => ({ items: [] }), cleanup() {} }),
    }),
    destroy: async () => {},
  }),
};
