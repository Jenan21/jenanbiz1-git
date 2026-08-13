// Service now delegates to the package engine implementation.
// This keeps runtime surface small and allows `packages/visual-dna` to be the canonical engine.
export { extractPaletteFromBase64 } from '../../packages/visual-dna/src/engine';

// Provide a default export object for CommonJS consumers
import * as engine from '../../packages/visual-dna/src/engine';
export default engine;
