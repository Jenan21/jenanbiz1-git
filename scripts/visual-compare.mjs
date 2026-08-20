import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import sharp from "sharp";

const argumentsList = process.argv.slice(2);
const [referencePath, actualPath, outputArgument] = argumentsList;
const maskFlagIndex = argumentsList.indexOf("--mask");
const maskPath =
  maskFlagIndex >= 0 ? argumentsList[maskFlagIndex + 1] : undefined;
const structuralMaskFlagIndex = argumentsList.indexOf("--structural-mask");
const structuralMaskPath =
  structuralMaskFlagIndex >= 0
    ? argumentsList[structuralMaskFlagIndex + 1]
    : undefined;
const mapRegionFlagIndex = argumentsList.indexOf("--map-region");
const mapRegionPath =
  mapRegionFlagIndex >= 0
    ? argumentsList[mapRegionFlagIndex + 1]
    : structuralMaskPath;

if (!referencePath || !actualPath) {
  console.error(
    "Usage: npm run visual:compare -- <reference.png> <actual.png> [output-directory] [--mask visual-mask.json] [--structural-mask structural-mask.json]",
  );
  process.exit(1);
}

const outputDirectory = path.resolve(outputArgument ?? "outputs/visual-diff");
await mkdir(outputDirectory, { recursive: true });

const referenceBuffer = await readFile(path.resolve(referencePath));
const actualBuffer = await readFile(path.resolve(actualPath));
const referenceMetadata = await sharp(referenceBuffer).metadata();

if (!referenceMetadata.width || !referenceMetadata.height) {
  throw new Error("Could not read the reference image dimensions.");
}

const width = referenceMetadata.width;
const height = referenceMetadata.height;
const normalizedReference = await sharp(referenceBuffer)
  .resize(width, height, { fit: "fill" })
  .png()
  .toBuffer();
const normalizedActual = await sharp(actualBuffer)
  .resize(width, height, { fit: "fill" })
  .png()
  .toBuffer();

function calculateComparison(rectangles) {
  const reference = PNG.sync.read(normalizedReference);
  const actual = PNG.sync.read(normalizedActual);
  const ignoredPixels = new Uint8Array(width * height);

  for (const rectangle of rectangles) {
    const startX = Math.max(0, Math.floor(rectangle.x));
    const startY = Math.max(0, Math.floor(rectangle.y));
    const endX = Math.min(width, Math.ceil(rectangle.x + rectangle.width));
    const endY = Math.min(height, Math.ceil(rectangle.y + rectangle.height));

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const pixelIndex = y * width + x;
        const channelIndex = pixelIndex * 4;
        ignoredPixels[pixelIndex] = 1;
        for (let channel = 0; channel < 3; channel += 1) {
          reference.data[channelIndex + channel] = 0;
          actual.data[channelIndex + channel] = 0;
        }
        reference.data[channelIndex + 3] = 255;
        actual.data[channelIndex + 3] = 255;
      }
    }
  }

  const diff = new PNG({ width, height });
  const differentPixels = pixelmatch(
    reference.data,
    actual.data,
    diff.data,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );
  const totalPixels = width * height;
  const maskedPixels = ignoredPixels.reduce((total, value) => total + value, 0);
  const comparedPixels = totalPixels - maskedPixels;
  const differencePercent = (differentPixels / comparedPixels) * 100;
  return {
    differentPixels,
    totalPixels,
    maskedPixels,
    comparedPixels,
    differencePercent,
    similarityPercent: 100 - differencePercent,
    diff,
  };
}

function createIgnoredPixels(rectangles) {
  const ignoredPixels = new Uint8Array(width * height);
  for (const rectangle of rectangles) {
    const startX = Math.max(0, Math.floor(rectangle.x));
    const startY = Math.max(0, Math.floor(rectangle.y));
    const endX = Math.min(width, Math.ceil(rectangle.x + rectangle.width));
    const endY = Math.min(height, Math.ceil(rectangle.y + rectangle.height));
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        ignoredPixels[y * width + x] = 1;
      }
    }
  }
  return ignoredPixels;
}

function calculateSsim(rectangles, blockSize = 8) {
  const reference = PNG.sync.read(normalizedReference);
  const actual = PNG.sync.read(normalizedActual);
  const ignoredPixels = createIgnoredPixels(rectangles);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let totalSsim = 0;
  let comparedBlocks = 0;
  const luminance = (data, index) =>
    data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;

  for (let blockY = 0; blockY < height; blockY += blockSize) {
    for (let blockX = 0; blockX < width; blockX += blockSize) {
      const referenceValues = [];
      const actualValues = [];
      for (let y = blockY; y < Math.min(height, blockY + blockSize); y += 1) {
        for (let x = blockX; x < Math.min(width, blockX + blockSize); x += 1) {
          const pixelIndex = y * width + x;
          if (ignoredPixels[pixelIndex]) continue;
          const channelIndex = pixelIndex * 4;
          referenceValues.push(luminance(reference.data, channelIndex));
          actualValues.push(luminance(actual.data, channelIndex));
        }
      }
      if (referenceValues.length < Math.ceil((blockSize * blockSize) / 2)) {
        continue;
      }
      const count = referenceValues.length;
      const referenceMean =
        referenceValues.reduce((sum, value) => sum + value, 0) / count;
      const actualMean =
        actualValues.reduce((sum, value) => sum + value, 0) / count;
      let referenceVariance = 0;
      let actualVariance = 0;
      let covariance = 0;
      for (let index = 0; index < count; index += 1) {
        const referenceDelta = referenceValues[index] - referenceMean;
        const actualDelta = actualValues[index] - actualMean;
        referenceVariance += referenceDelta ** 2;
        actualVariance += actualDelta ** 2;
        covariance += referenceDelta * actualDelta;
      }
      const divisor = Math.max(1, count - 1);
      referenceVariance /= divisor;
      actualVariance /= divisor;
      covariance /= divisor;
      const ssim =
        ((2 * referenceMean * actualMean + c1) * (2 * covariance + c2)) /
        ((referenceMean ** 2 + actualMean ** 2 + c1) *
          (referenceVariance + actualVariance + c2));
      totalSsim += Math.max(-1, Math.min(1, ssim));
      comparedBlocks += 1;
    }
  }
  const meanSsim = totalSsim / comparedBlocks;
  return {
    method: "8x8 luminance SSIM after production-data and exposed-map masks",
    comparedBlocks,
    meanSsim,
    similarityPercent: ((meanSsim + 1) / 2) * 100,
  };
}

async function readRectangles(filePath) {
  if (!filePath) return [];
  const mask = JSON.parse(
    (await readFile(path.resolve(filePath), "utf8")).replace(/^\uFEFF/, ""),
  );
  return Array.isArray(mask.rectangles) ? mask.rectangles : [];
}

const maskRectangles = await readRectangles(maskPath);
const structuralMaskRectangles = await readRectangles(structuralMaskPath);
const mapRegionRectangles = await readRectangles(mapRegionPath);
const rawComparison = calculateComparison([]);
const productionComparison = calculateComparison(maskRectangles);
const structuralComparison = calculateComparison([
  ...maskRectangles,
  ...structuralMaskRectangles,
]);
const structuralSsim = calculateSsim([
  ...maskRectangles,
  ...structuralMaskRectangles,
]);

const structuralRegionPixels =
  structuralComparison.maskedPixels - productionComparison.maskedPixels;
const structuralRegionDifferentPixels =
  productionComparison.differentPixels - structuralComparison.differentPixels;
const structuralRegionDifferencePercent =
  (structuralRegionDifferentPixels / structuralRegionPixels) * 100;

function calculateRegionComparison(rectangles) {
  const reference = PNG.sync.read(normalizedReference);
  const actual = PNG.sync.read(normalizedActual);
  const regionPixels = new Uint8Array(width * height);
  let regionPixelCount = 0;

  for (const rectangle of rectangles) {
    const startX = Math.max(0, Math.floor(rectangle.x));
    const startY = Math.max(0, Math.floor(rectangle.y));
    const endX = Math.min(width, Math.ceil(rectangle.x + rectangle.width));
    const endY = Math.min(height, Math.ceil(rectangle.y + rectangle.height));
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const pixelIndex = y * width + x;
        if (!regionPixels[pixelIndex]) {
          regionPixels[pixelIndex] = 1;
          regionPixelCount += 1;
        }
      }
    }
  }

  const diff = new PNG({ width, height });
  const allDifferentPixels = pixelmatch(
    reference.data,
    actual.data,
    diff.data,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );
  let differentPixels = 0;
  for (let pixelIndex = 0; pixelIndex < regionPixels.length; pixelIndex += 1) {
    if (!regionPixels[pixelIndex]) continue;
    const channelIndex = pixelIndex * 4;
    if (
      diff.data[channelIndex] === 255 &&
      diff.data[channelIndex + 1] === 0 &&
      diff.data[channelIndex + 2] === 0
    ) {
      differentPixels += 1;
    }
  }
  return {
    regionPixelCount,
    differentPixels,
    allDifferentPixels,
    differencePercent: (differentPixels / regionPixelCount) * 100,
  };
}

const mapRegionComparison = calculateRegionComparison(mapRegionRectangles);

await writeFile(
  path.join(outputDirectory, "reference-normalized.png"),
  normalizedReference,
);
await writeFile(
  path.join(outputDirectory, "actual-normalized.png"),
  normalizedActual,
);
await writeFile(
  path.join(outputDirectory, "diff.png"),
  PNG.sync.write(productionComparison.diff),
);
await writeFile(
  path.join(outputDirectory, "diff-structural.png"),
  PNG.sync.write(structuralComparison.diff),
);
const overlayReference = PNG.sync.read(normalizedReference);
const overlayActual = PNG.sync.read(normalizedActual);
const overlay = new PNG({ width, height });
for (let index = 0; index < overlay.data.length; index += 4) {
  overlay.data[index] = Math.round(
    (overlayReference.data[index] + overlayActual.data[index]) / 2,
  );
  overlay.data[index + 1] = Math.round(
    (overlayReference.data[index + 1] + overlayActual.data[index + 1]) / 2,
  );
  overlay.data[index + 2] = Math.round(
    (overlayReference.data[index + 2] + overlayActual.data[index + 2]) / 2,
  );
  overlay.data[index + 3] = 255;
}
await writeFile(
  path.join(outputDirectory, "overlay.png"),
  PNG.sync.write(overlay),
);

const report = {
  reference: path.resolve(referencePath),
  actual: path.resolve(actualPath),
  dimensions: { width, height },
  productionDataMask: maskPath
    ? {
        path: path.resolve(maskPath),
        rectangles: maskRectangles.map(({ name, x, y, width, height }) => ({
          name,
          x,
          y,
          width,
          height,
        })),
        maskedPixels: productionComparison.maskedPixels,
      }
    : null,
  structuralMask: structuralMaskPath
    ? {
        path: path.resolve(structuralMaskPath),
        rectangles: structuralMaskRectangles,
        totalMaskedPixels: structuralComparison.maskedPixels,
      }
    : null,
  raw: {
    differentPixels: rawComparison.differentPixels,
    totalPixels: rawComparison.totalPixels,
    differencePercent: Number(rawComparison.differencePercent.toFixed(4)),
    similarityPercent: Number(rawComparison.similarityPercent.toFixed(4)),
  },
  productionDataMasked: {
    differentPixels: productionComparison.differentPixels,
    comparedPixels: productionComparison.comparedPixels,
    differencePercent: Number(
      productionComparison.differencePercent.toFixed(4),
    ),
    similarityPercent: Number(
      productionComparison.similarityPercent.toFixed(4),
    ),
  },
  uiStructural: {
    differentPixels: structuralComparison.differentPixels,
    comparedPixels: structuralComparison.comparedPixels,
    differencePercent: Number(
      structuralComparison.differencePercent.toFixed(4),
    ),
    similarityPercent: Number(
      structuralComparison.similarityPercent.toFixed(4),
    ),
    ssimMethod: structuralSsim.method,
    ssimComparedBlocks: structuralSsim.comparedBlocks,
    ssimSimilarityPercent: Number(structuralSsim.similarityPercent.toFixed(4)),
  },
  isolatedMapRegion: structuralMaskPath
    ? {
        pixels: structuralRegionPixels,
        differentPixels: structuralRegionDifferentPixels,
        differencePercent: Number(structuralRegionDifferencePercent.toFixed(4)),
        contributionToProductionMaskedDifferencePercent: Number(
          (
            (structuralRegionDifferentPixels /
              productionComparison.comparedPixels) *
            100
          ).toFixed(4),
        ),
      }
    : null,
  mapArtworkOnly: mapRegionPath
    ? {
        path: path.resolve(mapRegionPath),
        pixels: mapRegionComparison.regionPixelCount,
        differentPixels: mapRegionComparison.differentPixels,
        differencePercent: Number(
          mapRegionComparison.differencePercent.toFixed(4),
        ),
        contributionToRawDifferencePercent: Number(
          (
            (mapRegionComparison.differentPixels / rawComparison.totalPixels) *
            100
          ).toFixed(4),
        ),
        contributionToProductionMaskedDifferencePercent: Number(
          (
            (mapRegionComparison.differentPixels /
              productionComparison.comparedPixels) *
            100
          ).toFixed(4),
        ),
        remainingRawDifferenceOutsideMapPercent: Number(
          (
            rawComparison.differencePercent -
            (mapRegionComparison.differentPixels / rawComparison.totalPixels) *
              100
          ).toFixed(4),
        ),
      }
    : null,
  threshold: 0.1,
};

await writeFile(
  path.join(outputDirectory, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report, null, 2));
