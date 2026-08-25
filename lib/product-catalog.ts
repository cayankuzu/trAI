export type CatalogImage = {
  src: string;
  alt: string;
  view: "Ön" | "Arka";
  width: number;
  height: number;
};

export type CatalogSizeRow = {
  size: string;
  chestCm: number;
  waistCm: number;
  hipCm: number;
};

export type CatalogAudience = "Kadın" | "Erkek" | "Unisex";
export type CatalogGarmentType = "Tişört" | "Kazak" | "Ceket" | "Gömlek" | "Jean" | "Pantolon";

export type CatalogProduct = {
  id: string;
  brand: string;
  title: string;
  description: string;
  category: string;
  categoryKey: "tops" | "bottoms" | "one-piece";
  garmentType: "top" | "bottom" | "one-piece";
  productType: CatalogGarmentType;
  sizeSystem: "alpha" | "EU" | "W";
  sizeGuideKind: "body" | "garment";
  audience: CatalogAudience;
  price: string;
  color: string;
  reference: string;
  material: string;
  fit: string;
  availability: string;
  availableSizes: string[];
  care: string[];
  sizeGuide: CatalogSizeRow[];
  sizeGuideNote: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  images: CatalogImage[];
  garmentImage: string;
  garmentImages: { front: string; back?: string };
  providerGarmentImages?: { front?: string; back?: string };
  providerGarmentPhotoTypes?: {
    front?: "auto" | "model" | "flat-lay";
    back?: "auto" | "model" | "flat-lay";
  };
  renderingProfile: {
    garmentPhotoType: "auto" | "model" | "flat-lay";
    materialDescription: string;
    silhouetteDescription: string;
    viewDescriptions: { front: string; back?: string };
    referenceNote: string;
  };
};

const MEN_ALPHA_BODY_GUIDE: readonly CatalogSizeRow[] = [
  { size: "XXS", chestCm: 81, waistCm: 61, hipCm: 81 },
  { size: "XS", chestCm: 87, waistCm: 67, hipCm: 87 },
  { size: "S", chestCm: 93, waistCm: 73, hipCm: 93 },
  { size: "M", chestCm: 99, waistCm: 79, hipCm: 99 },
  { size: "L", chestCm: 105, waistCm: 85, hipCm: 105 },
  { size: "XL", chestCm: 111, waistCm: 91, hipCm: 111 },
];

const MEN_EU_BOTTOM_BODY_GUIDE: readonly CatalogSizeRow[] = [
  { size: "32", chestCm: 81, waistCm: 62, hipCm: 82 },
  { size: "34", chestCm: 85, waistCm: 66, hipCm: 86 },
  { size: "36", chestCm: 89, waistCm: 70, hipCm: 90 },
  { size: "38", chestCm: 93, waistCm: 74, hipCm: 94 },
  { size: "40", chestCm: 97, waistCm: 78, hipCm: 98 },
  { size: "42", chestCm: 101, waistCm: 82, hipCm: 102 },
  { size: "44", chestCm: 105, waistCm: 86, hipCm: 106 },
  { size: "46", chestCm: 109, waistCm: 90, hipCm: 110 },
];

const CATALOG_SOURCE_CHECKED_AT = "25.08.2026";
const AVAILABILITY_NOTE = "Fiyat ve stok mağaza sayfasında değişebilir";
const UPPER_SIZE_GUIDE_NOTE = "Bershka erkek üst giyim hedef vücut ölçüsü rehberidir; ürünün düz zemindeki fiziksel ölçüsü değildir.";
const LOWER_ALPHA_SIZE_GUIDE_NOTE = "Bershka erkek alt giyim hedef vücut ölçüsü rehberidir; ürünün fiziksel bel ve paça ölçüsü değildir.";
const LOWER_EU_SIZE_GUIDE_NOTE = "Bershka erkek jean bedenleri için hedef vücut ölçüsü rehberidir; ürünün fiziksel bel ve paça ölçüsü değildir.";
const VERIFIED_REFERENCE_NOTE = "Resmî ön ve arka düz ürün görselleri ile katalog verileri 25.08.2026 tarihinde doğrulandı; fiziksel ürün ölçüleri kaynakta yayınlanmıyor.";

function sizeGuideFor(sizes: readonly string[], source: readonly CatalogSizeRow[]) {
  const includedSizes = new Set(sizes);
  return source.filter((row) => includedSizes.has(row.size)).map((row) => ({ ...row }));
}

function catalogMedia(slug: string, title: string, color: string) {
  const front = `/catalog/${slug}-front.jpg`;
  const back = `/catalog/${slug}-back.jpg`;
  return {
    images: [
      { src: front, alt: `${color} ${title} ön görünümü`, view: "Ön" as const, width: 850, height: 1090 },
      { src: back, alt: `${color} ${title} arka görünümü`, view: "Arka" as const, width: 850, height: 1090 },
    ],
    garmentImage: front,
    garmentImages: { front, back },
  };
}

export const PRODUCT_CATALOG: readonly CatalogProduct[] = [
  {
    id: "bershka-spider-man-tee-1086-222-810",
    brand: "Bershka",
    title: "SPIDER-MAN kısa kollu tişört",
    description: "Ön ve arka baskılı, kısa kollu gri erkek tişörtü. Portfolyo MVP kataloğunda deneme ürünü olarak kullanılır.",
    category: "Erkek / Tişört",
    categoryKey: "tops",
    garmentType: "top",
    productType: "Tişört",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.190,00 TL",
    color: "Gri",
    reference: "1086/222/810",
    material: "%100 pamuk",
    fit: "Oversize görünümlü düz kesim",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["XS", "S", "M", "L", "XL"],
    care: [
      "En fazla 30°C kısa programda yıka",
      "Ağartıcı kullanma",
      "En fazla 110°C'de ütüle",
      "Kurutma makinesi kullanma",
    ],
    sizeGuide: sizeGuideFor(["XS", "S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: UPPER_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/spider-man-k%C4%B1sa-kollu-ti%C5%9F%C3%B6rt-c0p229737212.html?colorId=810",
    sourceCheckedAt: "24.08.2026",
    images: [
      {
        src: "/catalog/bershka-spider-man-tee-front.jpg",
        alt: "Gri Spider-Man kısa kollu tişörtün ön görünümü",
        view: "Ön",
        width: 850,
        height: 1090,
      },
      {
        src: "/catalog/bershka-spider-man-tee-back.jpg",
        alt: "Gri Spider-Man kısa kollu tişörtün arka görünümü",
        view: "Arka",
        width: 850,
        height: 1090,
      },
    ],
    garmentImage: "/catalog/bershka-spider-man-tee-front.jpg",
    garmentImages: {
      front: "/catalog/bershka-spider-man-tee-front.jpg",
      back: "/catalog/bershka-spider-man-tee-back.jpg",
    },
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/e91c/c68c/1c014c498dff/95f92ecf81f4/01086222810-a4o/01086222810-a4o.jpg?f=auto&ts=1771592599809&w=2000",
      back: "https://static.bershka.net/assets/public/de9b/eb74/84214dbca3eb/b0878cb9aab4/01086222810-a1t/01086222810-a1t.jpg?ts=1772115280913&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "model" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "100 percent cotton with a matte, washed charcoal-grey appearance visible in the reference image",
      silhouetteDescription: "oversized straight silhouette with dropped shoulders, wide short sleeves, a crew neck, and a long straight hem",
      viewDescriptions: {
        front: "washed charcoal-grey crew-neck T-shirt with the exact large monochrome Spider-Man figure artwork shown across the front",
        back: "washed charcoal-grey crew-neck T-shirt with the exact large monochrome SPIDER-MAN wordmark artwork shown across the upper back",
      },
      referenceNote: "Ön ve arka ürün referansları doğrulandı; fiziksel ürün ölçüleri kaynakta bulunmuyor.",
    },
  },
  {
    id: "bershka-spider-man-boxy-1081-190-600",
    brand: "Bershka",
    title: "SPIDER-MAN boxy fit tişört",
    description: "Kırmızı, boxy fit kısa kollu tişört; önde siyah örümcek ağı ve örümcek grafiği, arkada düz yüzey bulunur.",
    category: "Erkek / Tişört",
    categoryKey: "tops",
    garmentType: "top",
    productType: "Tişört",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.190,00 TL",
    color: "Kırmızı",
    reference: "1081/190/600",
    material: "%100 pamuk; dış kumaşın %70'i OCS sertifikalı organik yetiştirilmiş pamuk",
    fit: "Boxy fit; düşük omuzlu, geniş gövdeli ve kısa kollu",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["XXS", "XS", "S", "M", "L", "XL"],
    care: ["30°C'de hassas yıka", "Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Kurutma makinesi kullanma"],
    sizeGuide: sizeGuideFor(["XXS", "XS", "S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: UPPER_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/spider-man-boxy-fit-ti%C5%9F%C3%B6rt-c0p229737190.html?colorId=600",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-spider-man-boxy-red", "SPIDER-MAN boxy fit tişört", "Kırmızı"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/e795/ad38/e5594b15a5a6/72a845831b29/01081190600-a4o/01081190600-a4o.jpg?ts=1771592595620&w=2000",
      back: "https://static.bershka.net/assets/public/1769/1c60/b30944b88925/ce493c716fe8/01081190600-b/01081190600-b.jpg?ts=1771592595569&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "100 percent cotton jersey with a clean matte red surface and crisp black screen print",
      silhouetteDescription: "boxy wide torso, dropped shoulders, wide short sleeves, crew neck, and straight hem",
      viewDescriptions: {
        front: "exact red T-shirt with the black spider-web field and centered black spider emblem from the official packshot",
        back: "plain red back with no artwork, preserving the boxy shoulder and sleeve proportions",
      },
      referenceNote: VERIFIED_REFERENCE_NOTE,
    },
  },
  {
    id: "bershka-henley-knit-2724-596-802",
    brand: "Bershka",
    title: "Düğmeli yaka triko kazak",
    description: "Gri, ince nervürlü triko kazak; Henley yaka, dört düğmeli pat, uzun kol ve düz arka tasarıma sahiptir.",
    category: "Erkek / Kazak",
    categoryKey: "tops",
    garmentType: "top",
    productType: "Kazak",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.290,00 TL",
    color: "Gri",
    reference: "2724/596/802",
    material: "%100 polyester",
    fit: "Rahat düz triko kesim; uzun kollu ve Henley yakalı",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["XS", "S", "M", "L", "XL"],
    care: ["Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Kuru temizleme yapma", "Kurutma makinesi kullanma"],
    sizeGuide: sizeGuideFor(["XS", "S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: UPPER_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/d%C3%BC%C4%9Fmeli-yaka-triko-kazak-c0p226931760.html?colorId=802",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-henley-knit-grey", "düğmeli yaka triko kazak", "Gri"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/57e9/b70b/3ce64f1288bc/cd99fd9555ff/02724596802-a4o/02724596802-a4o.jpg?ts=1782369750867&w=2000",
      back: "https://static.bershka.net/assets/public/1142/3636/bcd247228221/8dffae217942/02724596802-b/02724596802-b.jpg?ts=1782369751135&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "fine grey polyester rib knit with clearly visible vertical ribs and soft knitted drape",
      silhouetteDescription: "straight relaxed long-sleeve knit silhouette with a round Henley collar, four-button placket, and clean hem",
      viewDescriptions: {
        front: "grey fine-rib knit jumper with the exact four dark buttons and narrow Henley placket shown in the packshot",
        back: "plain grey fine-rib knit back without artwork or extra panels",
      },
      referenceNote: `${VERIFIED_REFERENCE_NOTE} Kaynak modelin L beden giydiğini bildiriyor ancak boy bilgisini yayınlamıyor.`,
    },
  },
  {
    id: "bershka-studded-faux-leather-2560-677-122",
    brand: "Bershka",
    title: "Zımbalı suni deri ceket",
    description: "Kızıl kahverengi, eskitilmiş görünümlü kapüşonlu suni deri ceket; metal zımba şeritleri ve sırtta ton sür ton gotik nakış taşır.",
    category: "Erkek / Ceket",
    categoryKey: "tops",
    garmentType: "top",
    productType: "Ceket",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "3.990,00 TL",
    color: "Kızıl kahverengi",
    reference: "2560/677/122",
    material: "Polyester taban üzerinde poliüretan kaplama; %100 polyester astar ve dolgu",
    fit: "Rahat dış giyim kesimi; kapüşonlu, fermuarlı ve lastikli etekli",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["S", "M", "L", "XL"],
    care: ["Yıkama yapma", "Ağartıcı kullanma", "Ütüleme yapma", "Kuru temizleme ve makinede kurutma yapma; yalnız silerek temizle"],
    sizeGuide: sizeGuideFor(["S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: UPPER_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/z%C4%B1mbal%C4%B1-suni-deri-ceket-c0p226931500.html?colorId=122",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-studded-faux-leather-brown", "zımbalı suni deri ceket", "Kızıl kahverengi"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/e1d9/3375/994c487c9bdf/3b34e09cbab0/02560677122-a4o/02560677122-a4o.jpg?ts=1780577114660&w=2000",
      back: "https://static.bershka.net/assets/public/b262/9409/290b4eb88f45/347f6e52cd08/02560677122-b/02560677122-b.jpg?ts=1780577114699&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "distressed reddish-brown polyurethane faux leather with controlled sheen, dark lining, and silver-tone stud hardware",
      silhouetteDescription: "relaxed hooded zip jacket with elastic cuffs and hem, roomy sleeves, and kangaroo-style front pockets",
      viewDescriptions: {
        front: "exact reddish-brown hooded zip jacket with matching stud bands across the shoulders and down both sleeves",
        back: "exact tonal gothic embroidery and horizontal silver-tone stud line across the upper back",
      },
      referenceNote: `${VERIFIED_REFERENCE_NOTE} Kaynakta model 188 cm ve L beden olarak belirtiliyor.`,
    },
  },
  {
    id: "bershka-stripe-print-long-sleeve-3247-120-252",
    brand: "Bershka",
    title: "Uzun kollu baskılı tişört",
    description: "Kirli beyaz bisiklet yaka tişört; sade gövde, iki kol boyunca siyah el yazısı ve çizgisel baskı, sade arka yüz.",
    category: "Erkek / Tişört",
    categoryKey: "tops",
    garmentType: "top",
    productType: "Tişört",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.290,00 TL",
    color: "Kirli beyaz",
    reference: "3247/120/252",
    material: "%100 pamuk",
    fit: "Rahat düz kesim; bisiklet yaka ve uzun kollu",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["XS", "S", "M", "L", "XL"],
    care: ["30°C'de hassas yıka", "Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Kuru temizleme ve makinede kurutma yapma"],
    sizeGuide: sizeGuideFor(["XS", "S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: UPPER_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/uzun-kollu-bask%C4%B1l%C4%B1-ti%C5%9F%C3%B6rt-c0p228480477.html?colorId=252",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-stripe-print-long-sleeve-off-white", "uzun kollu baskılı tişört", "Kirli beyaz"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/c479/078b/f9834bd09b79/08b815778dde/03247120252-a4o/03247120252-a4o.jpg?ts=1785825832180&w=2000",
      back: "https://static.bershka.net/assets/public/afe9/5181/1c364bee8300/e8ad6146f4f4/03247120252-b/03247120252-b.jpg?ts=1785825832460&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "soft matte off-white cotton jersey with high-contrast black handwritten and linear sleeve print",
      silhouetteDescription: "relaxed straight long-sleeve crew-neck T-shirt with regular shoulder placement and straight hem",
      viewDescriptions: {
        front: "plain off-white torso with the exact black handwritten linear graphics running along both sleeves",
        back: "plain off-white back while retaining the sleeve graphics visible from the rear",
      },
      referenceNote: `${VERIFIED_REFERENCE_NOTE} Kaynakta model 189 cm ve L beden olarak belirtiliyor.`,
    },
  },
  {
    id: "bershka-check-print-shirt-3478-224-952",
    brand: "Bershka",
    title: "Uzun kollu baskılı kareli gömlek",
    description: "Bej mikro kareli düğmeli gömlek; klasik yaka, sol göğüs cebi ve sırtta büyük siyah Midnight Culture baskısı bulunur.",
    category: "Erkek / Gömlek",
    categoryKey: "tops",
    garmentType: "top",
    productType: "Gömlek",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.990,00 TL",
    color: "Bej",
    reference: "3478/224/952",
    material: "%98 pamuk, %1 polyester, %1 elastan",
    fit: "Rahat düz gömlek kesimi; klasik yaka ve uzun kol",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["XS", "S", "M", "L", "XL"],
    care: ["30°C'de hassas yıka", "Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Kuru temizleme ve makinede kurutma yapma"],
    sizeGuide: sizeGuideFor(["XS", "S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: UPPER_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/uzun-kollu-bask%C4%B1l%C4%B1-kareli-g%C3%B6mlek-c0p228664607.html?colorId=952",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-check-print-shirt-beige", "uzun kollu baskılı kareli gömlek", "Bej"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/22f2/c754/102742e295ca/a0d42b4edb4b/03478224952-a4o/03478224952-a4o.jpg?ts=1786344084436&w=2000",
      back: "https://static.bershka.net/assets/public/27e3/89c7/3cb04e92b2f0/2957cbdf0e60/03478224952-b/03478224952-b.jpg?ts=1786344084305&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "light beige micro-check cotton-rich woven fabric with subtle stretch, dark buttons, and crisp black print",
      silhouetteDescription: "relaxed straight button-front shirt with classic collar, long cuffed sleeves, chest pocket, and curved hem",
      viewDescriptions: {
        front: "exact beige micro-check pattern, dark buttons, left chest pocket, and small black text details at the hem and cuffs",
        back: "exact large black handwritten Midnight Culture artwork centered across the upper and middle back",
      },
      referenceNote: `${VERIFIED_REFERENCE_NOTE} Kaynakta model 188 cm ve L beden olarak belirtiliyor.`,
    },
  },
  {
    id: "bershka-relaxed-print-tee-3563-734-800",
    brand: "Bershka",
    title: "Kısa kollu relaxed fit baskılı tişört",
    description: "Siyah relaxed fit tişört; önde küçük BLURRED/BASED tipografisi, arkada büyük beyaz-mavi Rare Breed baskısı taşır.",
    category: "Erkek / Tişört",
    categoryKey: "tops",
    garmentType: "top",
    productType: "Tişört",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "850,00 TL",
    color: "Siyah",
    reference: "3563/734/800",
    material: "%100 pamuk; dış kumaşın %70'i OCS sertifikalı organik yetiştirilmiş pamuk",
    fit: "Relaxed fit; geniş gövdeli, düşük omuzlu ve kısa kollu",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["XS", "S", "M", "L", "XL"],
    care: ["Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Kuru temizleme ve makinede kurutma yapma"],
    sizeGuide: sizeGuideFor(["XS", "S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: UPPER_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/k%C4%B1sa-kollu-relaxed-fit-bask%C4%B1l%C4%B1-ti%C5%9F%C3%B6rt-c0p230182165.html?colorId=800",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-relaxed-print-tee-black", "kısa kollu relaxed fit baskılı tişört", "Siyah"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/722a/d269/e7934da0807a/79d6af35ba1b/03563734800-a4o/03563734800-a4o.jpg?ts=1783080326049&w=2000",
      back: "https://static.bershka.net/assets/public/b79f/2e79/3c9c42a59a85/9ec39eef1f19/03563734800-b/03563734800-b.jpg?ts=1783080326611&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "matte black cotton jersey with crisp white and electric-blue airbrushed typography",
      silhouetteDescription: "relaxed straight silhouette with dropped shoulders, wide short sleeves, crew neck, and long straight hem",
      viewDescriptions: {
        front: "black T-shirt with the exact small centered BLURRED BASED white-blue chest graphic",
        back: "black T-shirt with the exact large white-blue I MIGHT BE A Rare Breed script artwork and small baseline text",
      },
      referenceNote: VERIFIED_REFERENCE_NOTE,
    },
  },
  {
    id: "bershka-baggy-cargo-jean-3043-335-811",
    brand: "Bershka",
    title: "Baggy fit kargo jean",
    description: "Açık gri yıkamalı baggy jean; geniş düz paça, belirgin panel dikişleri ve iki yanda büyük kapaklı kargo cepleri bulunur.",
    category: "Erkek / Jean",
    categoryKey: "bottoms",
    garmentType: "bottom",
    productType: "Jean",
    sizeSystem: "EU",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.990,00 TL",
    color: "Gri",
    reference: "3043/335/811",
    material: "%100 pamuk; dış kumaşın %70'i OCS sertifikalı organik yetiştirilmiş pamuk",
    fit: "Baggy fit; düşük hacimli bel ve geniş düz paça",
    availability: "Yakında stokta; fiyat ve stok mağaza sayfasında değişebilir",
    availableSizes: ["32", "34", "36", "38", "40", "42", "44", "46"],
    care: ["30°C'de hassas ve ayrı yıka", "Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Düşük ısıda makinede kurut"],
    sizeGuide: sizeGuideFor(["32", "34", "36", "38", "40", "42", "44", "46"], MEN_EU_BOTTOM_BODY_GUIDE),
    sizeGuideNote: LOWER_EU_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/baggy-fit-kargo-jean-c0p228459983.html?colorId=811",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-baggy-cargo-jean-grey", "baggy fit kargo jean", "Gri"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/6ec4/2ff6/27a944bd8a7c/137804ab5d1c/03043335811-a4o/03043335811-a4o.jpg?ts=1786968362694&w=2000",
      back: "https://static.bershka.net/assets/public/7ccb/29fc/850d49e1a748/cf9992bfd460/03043335811-b/03043335811-b.jpg?ts=1786968364038&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "100 percent cotton rigid denim with a very light grey stone wash, visible grain, and tonal stitching",
      silhouetteDescription: "baggy cargo jean with broad straight legs, structured waistband, knee panel seams, and oversized side cargo pockets",
      viewDescriptions: {
        front: "exact pale-grey wash, five-pocket front, horizontal knee seams, and large rectangular cargo pockets on both outer thighs",
        back: "exact two square rear patch pockets, rear yoke, side cargo pockets, and wide straight hems",
      },
      referenceNote: VERIFIED_REFERENCE_NOTE,
    },
  },
  {
    id: "bershka-side-patch-super-baggy-jean-2578-335-428",
    brand: "Bershka",
    title: "Yan yamalı super baggy fit jean",
    description: "Açık mavi yıkamalı super baggy jean; iki yana devam eden büyük ART SKILL yazılı nakış-yama detayı taşır.",
    category: "Erkek / Jean",
    categoryKey: "bottoms",
    garmentType: "bottom",
    productType: "Jean",
    sizeSystem: "EU",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "2.690,00 TL",
    color: "Açık mavi",
    reference: "2578/335/428",
    material: "%100 pamuk; dış kumaşın %65'i OCS sertifikalı organik yetiştirilmiş pamuk",
    fit: "Super baggy fit; çok geniş ve uzun düz paça",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["32", "34", "36", "38", "40", "42", "44", "46"],
    care: ["30°C'de hassas ve ayrı yıka", "Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Düşük ısıda makinede kurut"],
    sizeGuide: sizeGuideFor(["32", "34", "36", "38", "40", "42", "44", "46"], MEN_EU_BOTTOM_BODY_GUIDE),
    sizeGuideNote: LOWER_EU_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/yan-yamal%C4%B1-super-baggy-fit-jean-c0p227381999.html?colorId=428",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-super-baggy-patch-jean-light-blue", "yan yamalı super baggy fit jean", "Açık mavi"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/7c15/536c/64df4fddb7c6/0a9e40f58675/02578335428-a4o/02578335428-a4o.jpg?ts=1785939838937&w=2000",
      back: "https://static.bershka.net/assets/public/3c26/9412/18ec4fee9b9b/1672565837ff/02578335428-b/02578335428-b.jpg?ts=1785939838418&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "light-blue cotton denim with pronounced cloudy stone fading, copper rivets, tonal seams, and pale outlined embroidery",
      silhouetteDescription: "super-baggy high-volume jean with very wide straight legs, classic five-pocket waist, and full-length side patch artwork",
      viewDescriptions: {
        front: "exact light-blue cloudy wash and large pale outlined ART SKILL patch artwork descending along the wearer's right outer leg",
        back: "exact rear yoke, two large patch pockets, faded seat, and continuation of the outlined side artwork",
      },
      referenceNote: VERIFIED_REFERENCE_NOTE,
    },
  },
  {
    id: "bershka-interlock-balloon-trouser-1269-190-812",
    brand: "Bershka",
    title: "Interlok balon pantolon",
    description: "Gri interlok pantolon; elastik ve bağcıklı bel, yan cepler, içe kıvrılan balon paça ve arkada tek cep bulunur.",
    category: "Erkek / Pantolon",
    categoryKey: "bottoms",
    garmentType: "bottom",
    productType: "Pantolon",
    sizeSystem: "alpha",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.790,00 TL",
    color: "Gri",
    reference: "1269/190/812",
    material: "%85 pamuk, %15 polyester; OCS organik pamuk ve RCS geri dönüştürülmüş polyester içerir",
    fit: "Balloon fit; kalçada hacimli, paçaya doğru kontrollü daralan",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["XS", "S", "M", "L", "XL"],
    care: ["Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Kurutma makinesi kullanma", "Etiketteki kuru temizleme talimatını uygula"],
    sizeGuide: sizeGuideFor(["XS", "S", "M", "L", "XL"], MEN_ALPHA_BODY_GUIDE),
    sizeGuideNote: LOWER_ALPHA_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/interlok-balon-pantolon-c0p229737060.html?colorId=812",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-interlock-balloon-trousers-grey", "interlok balon pantolon", "Gri"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/4a5f/cde8/bea5473097a4/ac99e7a32239/01269190812-a4o/01269190812-a4o.jpg?ts=1769098009144&w=2000",
      back: "https://static.bershka.net/assets/public/e7c8/4f53/cc6f43818ace/83d64ceb8325/01269190812-b/01269190812-b.jpg?ts=1769098008774&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "soft light-grey interlock jersey with a smooth dense knit, subtle mélange texture, and matching drawcord",
      silhouetteDescription: "balloon trouser with elastic drawstring waist, front pleats, roomy curved legs, and tapered inward hems",
      viewDescriptions: {
        front: "exact light-grey elastic waistband, centered matching bow drawcord, side pockets, front pleats, and sculpted balloon legs",
        back: "plain light-grey back with elastic gathers, one square patch pocket, and the same rounded tapered leg shape",
      },
      referenceNote: VERIFIED_REFERENCE_NOTE,
    },
  },
  {
    id: "bershka-baggy-cargo-jean-3043-335-800",
    brand: "Bershka",
    title: "Baggy fit kargo jean",
    description: "Siyah yıkamalı baggy jean; geniş düz paça, görünür panel dikişleri ve iki yanda kapaklı kargo cepleri bulunur.",
    category: "Erkek / Jean",
    categoryKey: "bottoms",
    garmentType: "bottom",
    productType: "Jean",
    sizeSystem: "EU",
    sizeGuideKind: "body",
    audience: "Erkek",
    price: "1.990,00 TL",
    color: "Siyah",
    reference: "3043/335/800",
    material: "%100 pamuk; dış kumaşın %70'i OCS sertifikalı organik yetiştirilmiş pamuk",
    fit: "Baggy fit; geniş ve düz paça",
    availability: AVAILABILITY_NOTE,
    availableSizes: ["32", "34", "36", "38", "40", "42", "44", "46"],
    care: ["30°C'de hassas ve ayrı yıka", "Ağartıcı kullanma", "En fazla 110°C'de ütüle", "Düşük ısıda makinede kurut"],
    sizeGuide: sizeGuideFor(["32", "34", "36", "38", "40", "42", "44", "46"], MEN_EU_BOTTOM_BODY_GUIDE),
    sizeGuideNote: LOWER_EU_SIZE_GUIDE_NOTE,
    sourceUrl: "https://www.bershka.com/tr/baggy-fit-kargo-jean-c0p228459984.html?colorId=800",
    sourceCheckedAt: CATALOG_SOURCE_CHECKED_AT,
    ...catalogMedia("bershka-baggy-cargo-jean-black", "baggy fit kargo jean", "Siyah"),
    providerGarmentImages: {
      front: "https://static.bershka.net/assets/public/d1e8/02cd/06a142d6a7d5/b56c42d8c152/03043335800-a4o/03043335800-a4o.jpg?ts=1786968366129&w=2000",
      back: "https://static.bershka.net/assets/public/0c91/03f5/06da486bbbe7/c49df5254400/03043335800-b/03043335800-b.jpg?ts=1786968367986&w=2000",
    },
    providerGarmentPhotoTypes: { front: "flat-lay", back: "flat-lay" },
    renderingProfile: {
      garmentPhotoType: "flat-lay",
      materialDescription: "100 percent cotton black denim with a charcoal washed surface, visible twill grain, and tonal black stitching",
      silhouetteDescription: "baggy cargo jean with wide straight legs, structured five-pocket waist, knee panel seams, and oversized side pockets",
      viewDescriptions: {
        front: "exact washed-black tone, front pockets, button closure, horizontal knee seams, and large rectangular cargo pockets",
        back: "exact rear yoke, two large patch pockets, side cargo pockets, dark wash variation, and wide straight hems",
      },
      referenceNote: VERIFIED_REFERENCE_NOTE,
    },
  },
];

export function getCatalogProduct(productId: string) {
  return PRODUCT_CATALOG.find((product) => product.id === productId) ?? null;
}
