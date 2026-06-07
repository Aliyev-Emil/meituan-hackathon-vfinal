/**
 * Run once: npm run photos
 * Downloads real JPG photos into public/venues/photos/
 * Then set USE_LOCAL_PHOTOS=true in images.ts (optional upgrade)
 */
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "venues", "photos");
fs.mkdirSync(outDir, { recursive: true });

const picIds = [292, 326, 431, 467, 490, 524, 626, 718, 225, 288, 1080, 1015, 1025, 1036, 1041, 1050];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          file.close();
          return download(res.headers.location, dest).then(resolve).catch(reject);
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

async function main() {
  for (let i = 1; i <= 20; i++) {
    const id = picIds[i % picIds.length];
    const dest = path.join(outDir, `r${i}.jpg`);
    console.log("Downloading", dest);
    await download(`https://picsum.photos/id/${id}/600/400.jpg`, dest);
  }
  for (let i = 1; i <= 16; i++) {
    const id = picIds[(i + 5) % picIds.length];
    const dest = path.join(outDir, `a${i}.jpg`);
    console.log("Downloading", dest);
    await download(`https://picsum.photos/id/${id}/600/400.jpg`, dest);
  }
  console.log("Done! Restart npm run dev");
}

main().catch(console.error);
