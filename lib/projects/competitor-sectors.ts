/**
 * Which kinds of places on OpenStreetMap count as competitors for a sector. A sector without a mapping here gets no
 * competitor discovery at all: counting every named place nearby, or matching on a tag almost nobody sets, would show
 * a competition level that says nothing about the idea. Broad sectors such as technology, services or energy have no
 * physical place type that stands for "a competitor", so they are left out on purpose.
 */
interface CompetitorSector {
  /** Matches the sector text in English or Arabic, as whole words. */
  pattern: RegExp;
  /** Overpass selectors; each one is combined with the search area. */
  selectors: readonly string[];
}

const ARABIC_LETTER = "\\u0600-\\u06ff";

/** English words are matched at word boundaries; Arabic words with an optional "ال"/"و" prefix and no Arabic letter around. */
function words(english: string, arabic: string) {
  return new RegExp(`\\b(?:${english})\\b|(?<![${ARABIC_LETTER}])(?:ال|و)?(?:${arabic})(?![${ARABIC_LETTER}])`, "i");
}

const SECTORS: readonly CompetitorSector[] = [
  {
    pattern: words("food|beverages?|restaurants?|cafes?|coffee|bakery", "أغذية|غذاء|غذائية|مشروبات|مطعم|مطاعم|مقهى|مقاهي|قهوة|مخبز|مخابز"),
    selectors: ['nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"]', 'nwr["shop"~"^(bakery|pastry|coffee)$"]["name"]'],
  },
  {
    pattern: words("retail|shops?|stores?|commerce", "تجزئة|متجر|متاجر|تجارة"),
    selectors: ['nwr["shop"]["name"]'],
  },
  {
    pattern: words("grocery|supermarkets?", "بقالة|بقالات|سوبرماركت"),
    selectors: ['nwr["shop"~"^(supermarket|convenience|greengrocer)$"]["name"]'],
  },
  {
    pattern: words("health|healthcare|medical|pharmacy|clinics?|dental", "صحة|صحي|صحية|طبي|طبية|طب|صيدلية|صيدليات|عيادة|عيادات|أسنان"),
    selectors: ['nwr["amenity"~"^(pharmacy|clinic|doctors|dentist|hospital)$"]["name"]'],
  },
  {
    pattern: words("education|schools?|training|academy", "تعليم|تعليمي|مدرسة|مدارس|تدريب|أكاديمية"),
    selectors: ['nwr["amenity"~"^(school|college|kindergarten|language_school|training)$"]["name"]'],
  },
  {
    pattern: words("fitness|gym|sports?", "لياقة|رياضة|رياضي|نادي"),
    selectors: ['nwr["leisure"~"^(fitness_centre|sports_centre)$"]["name"]'],
  },
  {
    pattern: words("beauty|salons?|barbers?", "تجميل|صالون|صالونات|حلاقة"),
    selectors: ['nwr["shop"~"^(hairdresser|beauty|cosmetics)$"]["name"]'],
  },
  {
    pattern: words("hotels?|hospitality|tourism|accommodation", "فندق|فنادق|ضيافة|سياحة"),
    selectors: ['nwr["tourism"~"^(hotel|hostel|guest_house|apartment)$"]["name"]'],
  },
  {
    pattern: words("automotive|cars?|vehicles?", "سيارات|سيارة|مركبات"),
    selectors: ['nwr["shop"~"^(car|car_repair|car_parts)$"]["name"]', 'nwr["amenity"="car_wash"]["name"]'],
  },
  {
    pattern: words("real estate|property", "عقار|عقارات"),
    selectors: ['nwr["office"="estate_agent"]["name"]', 'nwr["shop"="estate_agent"]["name"]'],
  },
];

/** The Overpass selectors for this sector, or null when the sector has no honest map category. */
export function competitorSelectorsFor(sector: string | null | undefined): readonly string[] | null {
  const text = sector?.trim();
  if (!text) return null;
  return SECTORS.find((entry) => entry.pattern.test(text))?.selectors ?? null;
}
