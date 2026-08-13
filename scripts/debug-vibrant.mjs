import fs from 'fs';
import path from 'path';

const imgPath = path.resolve(process.cwd(), 'public/assets/jenan-biz-logo.png');
const buf = fs.readFileSync(imgPath);

async function run() {
  // inspect module
  const VibrantModule = await import('node-vibrant/node');
  console.log('VibrantModule keys:', Object.keys(VibrantModule));

  // Attempt multiple import shapes
  const shapes = [
    VibrantModule?.default ?? null,
    VibrantModule?.Vibrant ?? null,
    VibrantModule ?? null,
  ];

  for (const shape of shapes) {
    try {
      if (!shape) continue;
      console.log('Trying shape:', typeof shape, Object.keys(shape || {}));
      if (typeof shape.from === 'function') {
        const v = shape.from(buf).maxColorCount(8);
        const palette = await v.getPalette();
        console.log('Palette via shape.from():', palette);
        return;
      }

      if (shape.Vibrant && typeof shape.Vibrant.from === 'function') {
        const v = shape.Vibrant.from(buf).maxColorCount(8);
        const palette = await v.getPalette();
        console.log('Palette via shape.Vibrant.from():', palette);
        return;
      }

      // Try constructor
      if (typeof shape === 'function') {
        const instance = new shape(buf);
        if (typeof instance.getPalette === 'function') {
          const palette = await instance.getPalette();
          console.log('Palette via new constructor:', palette);
          return;
        }
      }
    } catch (err) {
      console.warn('shape attempt failed:', err && err.message);
    }
  }

  console.error('No usable Vibrant API shape found.');
}

run().catch((e) => { console.error('debug error', e); process.exit(1); });
