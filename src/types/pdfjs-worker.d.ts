// pdf.js ships its worker entry without type declarations. We import it purely
// for its side effect (registering WorkerMessageHandler for main-thread use),
// so a bare module declaration is sufficient.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
