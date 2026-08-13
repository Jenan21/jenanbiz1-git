import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const imgPath = path.resolve(process.cwd(), 'public/assets/jenan-biz-logo.png');
const buf = fs.readFileSync(imgPath);
const base64 = `data:image/png;base64,${buf.toString('base64')}`;

async function run() {
  const res = await fetch('http://localhost:3000/api/tools/visual-dna', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: base64 }),
  });
  const json = await res.json();
  console.log('response:', json);
}

run().catch((e) => { console.error(e); process.exit(1); });
