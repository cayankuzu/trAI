import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outputDirectory = path.resolve(process.cwd(), "public", "catalog");

const assets = [
  {
    slug: "bershka-spider-man-boxy-red",
    front: "https://static.bershka.net/assets/public/e795/ad38/e5594b15a5a6/72a845831b29/01081190600-a4o/01081190600-a4o.jpg?ts=1771592595620",
    back: "https://static.bershka.net/assets/public/1769/1c60/b30944b88925/ce493c716fe8/01081190600-b/01081190600-b.jpg?ts=1771592595569",
  },
  {
    slug: "bershka-henley-knit-grey",
    front: "https://static.bershka.net/assets/public/57e9/b70b/3ce64f1288bc/cd99fd9555ff/02724596802-a4o/02724596802-a4o.jpg?ts=1782369750867",
    back: "https://static.bershka.net/assets/public/1142/3636/bcd247228221/8dffae217942/02724596802-b/02724596802-b.jpg?ts=1782369751135",
  },
  {
    slug: "bershka-studded-faux-leather-brown",
    front: "https://static.bershka.net/assets/public/e1d9/3375/994c487c9bdf/3b34e09cbab0/02560677122-a4o/02560677122-a4o.jpg?ts=1780577114660",
    back: "https://static.bershka.net/assets/public/b262/9409/290b4eb88f45/347f6e52cd08/02560677122-b/02560677122-b.jpg?ts=1780577114699",
  },
  {
    slug: "bershka-stripe-print-long-sleeve-off-white",
    front: "https://static.bershka.net/assets/public/c479/078b/f9834bd09b79/08b815778dde/03247120252-a4o/03247120252-a4o.jpg?ts=1785825832180",
    back: "https://static.bershka.net/assets/public/afe9/5181/1c364bee8300/e8ad6146f4f4/03247120252-b/03247120252-b.jpg?ts=1785825832460",
  },
  {
    slug: "bershka-check-print-shirt-beige",
    front: "https://static.bershka.net/assets/public/22f2/c754/102742e295ca/a0d42b4edb4b/03478224952-a4o/03478224952-a4o.jpg?ts=1786344084436",
    back: "https://static.bershka.net/assets/public/27e3/89c7/3cb04e92b2f0/2957cbdf0e60/03478224952-b/03478224952-b.jpg?ts=1786344084305",
  },
  {
    slug: "bershka-relaxed-print-tee-black",
    front: "https://static.bershka.net/assets/public/722a/d269/e7934da0807a/79d6af35ba1b/03563734800-a4o/03563734800-a4o.jpg?ts=1783080326049",
    back: "https://static.bershka.net/assets/public/b79f/2e79/3c9c42a59a85/9ec39eef1f19/03563734800-b/03563734800-b.jpg?ts=1783080326611",
  },
  {
    slug: "bershka-baggy-cargo-jean-grey",
    front: "https://static.bershka.net/assets/public/6ec4/2ff6/27a944bd8a7c/137804ab5d1c/03043335811-a4o/03043335811-a4o.jpg?ts=1786968362694",
    back: "https://static.bershka.net/assets/public/7ccb/29fc/850d49e1a748/cf9992bfd460/03043335811-b/03043335811-b.jpg?ts=1786968364038",
  },
  {
    slug: "bershka-super-baggy-patch-jean-light-blue",
    front: "https://static.bershka.net/assets/public/7c15/536c/64df4fddb7c6/0a9e40f58675/02578335428-a4o/02578335428-a4o.jpg?ts=1785939838937",
    back: "https://static.bershka.net/assets/public/3c26/9412/18ec4fee9b9b/1672565837ff/02578335428-b/02578335428-b.jpg?ts=1785939838418",
  },
  {
    slug: "bershka-interlock-balloon-trousers-grey",
    front: "https://static.bershka.net/assets/public/4a5f/cde8/bea5473097a4/ac99e7a32239/01269190812-a4o/01269190812-a4o.jpg?ts=1769098009144",
    back: "https://static.bershka.net/assets/public/e7c8/4f53/cc6f43818ace/83d64ceb8325/01269190812-b/01269190812-b.jpg?ts=1769098008774",
  },
  {
    slug: "bershka-baggy-cargo-jean-black",
    front: "https://static.bershka.net/assets/public/d1e8/02cd/06a142d6a7d5/b56c42d8c152/03043335800-a4o/03043335800-a4o.jpg?ts=1786968366129",
    back: "https://static.bershka.net/assets/public/0c91/03f5/06da486bbbe7/c49df5254400/03043335800-b/03043335800-b.jpg?ts=1786968367986",
  },
];

async function downloadAndNormalize(url, destination) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/jpeg",
      "User-Agent": "trAI-MVP/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }

  const source = Buffer.from(await response.arrayBuffer());
  await sharp(source, { failOn: "warning", limitInputPixels: 30_000_000 })
    .autoOrient()
    .resize({
      width: 850,
      height: 1090,
      fit: "contain",
      background: { r: 247, g: 247, b: 248 },
      kernel: sharp.kernel.lanczos3,
    })
    .flatten({ background: { r: 247, g: 247, b: 248 } })
    .toColourspace("srgb")
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(destination);
}

await mkdir(outputDirectory, { recursive: true });
for (const asset of assets) {
  await Promise.all([
    downloadAndNormalize(asset.front, path.join(outputDirectory, `${asset.slug}-front.jpg`)),
    downloadAndNormalize(asset.back, path.join(outputDirectory, `${asset.slug}-back.jpg`)),
  ]);
  process.stdout.write(`Synced ${asset.slug}\n`);
}
