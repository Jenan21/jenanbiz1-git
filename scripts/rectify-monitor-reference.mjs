import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { PNG } from "pngjs";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/rectify-monitor-reference.mjs <input> <output>");
}

const sourcePng = PNG.sync.read(await sharp(await readFile(inputPath)).png().toBuffer());
const targetWidth = 1672;
const targetHeight = 941;

// Inner monitor canvas corners measured from the approved photographic reference.
const sourceCorners = [
  [116, 52],
  [1067, 139],
  [1077, 710],
  [116, 771],
];
const targetCorners = [
  [0, 0],
  [targetWidth - 1, 0],
  [targetWidth - 1, targetHeight - 1],
  [0, targetHeight - 1],
];

function solveLinear(matrix, values) {
  const size = values.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    [values[column], values[pivot]] = [values[pivot], values[column]];
    const divisor = matrix[column][column];
    for (let index = column; index < size; index += 1) matrix[column][index] /= divisor;
    values[column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let index = column; index < size; index += 1) matrix[row][index] -= factor * matrix[column][index];
      values[row] -= factor * values[column];
    }
  }
  return values;
}

function homography(from, to) {
  const matrix = [];
  const values = [];
  for (let index = 0; index < 4; index += 1) {
    const [x, y] = from[index];
    const [u, v] = to[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }
  return [...solveLinear(matrix, values), 1];
}

const inverse = homography(targetCorners, sourceCorners);
const output = new PNG({ width: targetWidth, height: targetHeight });
const sample = (x, y, channel) => {
  const clampedX = Math.max(0, Math.min(sourcePng.width - 1, x));
  const clampedY = Math.max(0, Math.min(sourcePng.height - 1, y));
  return sourcePng.data[(clampedY * sourcePng.width + clampedX) * 4 + channel];
};

for (let y = 0; y < targetHeight; y += 1) {
  for (let x = 0; x < targetWidth; x += 1) {
    const denominator = inverse[6] * x + inverse[7] * y + inverse[8];
    const sourceX = (inverse[0] * x + inverse[1] * y + inverse[2]) / denominator;
    const sourceY = (inverse[3] * x + inverse[4] * y + inverse[5]) / denominator;
    const x0 = Math.floor(sourceX);
    const y0 = Math.floor(sourceY);
    const dx = sourceX - x0;
    const dy = sourceY - y0;
    const outputIndex = (y * targetWidth + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const top = sample(x0, y0, channel) * (1 - dx) + sample(x0 + 1, y0, channel) * dx;
      const bottom = sample(x0, y0 + 1, channel) * (1 - dx) + sample(x0 + 1, y0 + 1, channel) * dx;
      output.data[outputIndex + channel] = Math.round(top * (1 - dy) + bottom * dy);
    }
  }
}

await writeFile(outputPath, PNG.sync.write(output));
