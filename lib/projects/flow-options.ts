export type FlowCity = { value: string; label: readonly [string, string]; latitude: number; longitude: number };

export const SAUDI_CITIES: ReadonlyArray<FlowCity> = [
  { value: "Riyadh", label: ["الرياض", "Riyadh"], latitude: 24.7136, longitude: 46.6753 },
  { value: "Jeddah", label: ["جدة", "Jeddah"], latitude: 21.5433, longitude: 39.1728 },
  { value: "Dammam", label: ["الدمام", "Dammam"], latitude: 26.4207, longitude: 50.0888 },
  { value: "Khobar", label: ["الخبر", "Khobar"], latitude: 26.2172, longitude: 50.1971 },
  { value: "Makkah", label: ["مكة المكرمة", "Makkah"], latitude: 21.3891, longitude: 39.8579 },
  { value: "Madinah", label: ["المدينة المنورة", "Madinah"], latitude: 24.5247, longitude: 39.5692 },
  { value: "Taif", label: ["الطائف", "Taif"], latitude: 21.2854, longitude: 40.415 },
  { value: "Buraydah", label: ["بريدة", "Buraydah"], latitude: 26.326, longitude: 43.975 },
  { value: "Tabuk", label: ["تبوك", "Tabuk"], latitude: 28.3838, longitude: 36.5662 },
  { value: "Abha", label: ["أبها", "Abha"], latitude: 18.2164, longitude: 42.5053 },
  { value: "Hail", label: ["حائل", "Hail"], latitude: 27.5114, longitude: 41.7208 },
  { value: "Jazan", label: ["جازان", "Jazan"], latitude: 16.8892, longitude: 42.5511 },
];

/** `physical` sectors work from a real premises, so only they ask for the floor area. */
export const FLOW_SECTORS: ReadonlyArray<{ value: string; label: readonly [string, string]; physical: boolean }> = [
  { value: "Technology", label: ["التقنية والذكاء الاصطناعي", "Technology and AI"], physical: false },
  { value: "Food", label: ["الأغذية والمشروبات", "Food and beverage"], physical: true },
  { value: "Real Estate", label: ["العقار والبناء", "Real estate and construction"], physical: true },
  { value: "Energy", label: ["الطاقة", "Energy"], physical: true },
  { value: "Services", label: ["الخدمات", "Services"], physical: true },
];

/** The project area is asked only for activities that need a physical location. */
export function sectorNeedsArea(sector: string) {
  return FLOW_SECTORS.some((item) => item.value === sector && item.physical);
}

export const FLOW_AUDIENCES: ReadonlyArray<{ value: string; label: readonly [string, string] }> = [
  { value: "CONSUMERS", label: ["الأفراد والمستهلكون", "Consumers"] },
  { value: "BUSINESSES", label: ["الشركات والمنشآت", "Businesses"] },
  { value: "YOUTH", label: ["الشباب والموظفون", "Young people and employees"] },
  { value: "FAMILIES", label: ["العائلات", "Families"] },
];
