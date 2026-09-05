import fs from 'node:fs/promises';
const data=JSON.parse(await fs.readFile('data/public-data.json','utf8'));
await fs.writeFile('data/public-data.js',`window.PUBLIC_COUNTRY_DATA = ${JSON.stringify(data,null,2)};\n`);
console.log('public-data.js rewritten as data only');
