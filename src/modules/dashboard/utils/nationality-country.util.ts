export type CountryGeo = {
  name: string;
  iso: string;
  lat: number;
  lng: number;
};

const COUNTRIES: CountryGeo[] = [
  { name: 'India', iso: 'IN', lat: 20.59, lng: 78.96 },
  { name: 'Pakistan', iso: 'PK', lat: 30.38, lng: 69.35 },
  { name: 'Bangladesh', iso: 'BD', lat: 23.68, lng: 90.36 },
  { name: 'Nepal', iso: 'NP', lat: 28.39, lng: 84.12 },
  { name: 'Philippines', iso: 'PH', lat: 12.88, lng: 121.77 },
  { name: 'United Arab Emirates', iso: 'AE', lat: 23.42, lng: 53.85 },
  { name: 'Sri Lanka', iso: 'LK', lat: 7.87, lng: 80.77 },
  { name: 'Egypt', iso: 'EG', lat: 26.82, lng: 30.8 },
  { name: 'China', iso: 'CN', lat: 35.86, lng: 104.2 },
  { name: 'Indonesia', iso: 'ID', lat: -0.79, lng: 113.92 },
  { name: 'Afghanistan', iso: 'AF', lat: 33.94, lng: 67.71 },
  { name: 'Iran', iso: 'IR', lat: 32.43, lng: 53.69 },
  { name: 'Jordan', iso: 'JO', lat: 30.59, lng: 36.24 },
  { name: 'Lebanon', iso: 'LB', lat: 33.85, lng: 35.86 },
  { name: 'Syria', iso: 'SY', lat: 34.8, lng: 38.0 },
  { name: 'Yemen', iso: 'YE', lat: 15.55, lng: 48.52 },
  { name: 'Oman', iso: 'OM', lat: 21.51, lng: 55.92 },
  { name: 'Qatar', iso: 'QA', lat: 25.35, lng: 51.18 },
  { name: 'Saudi Arabia', iso: 'SA', lat: 23.89, lng: 45.08 },
  { name: 'Kuwait', iso: 'KW', lat: 29.31, lng: 47.48 },
  { name: 'Bahrain', iso: 'BH', lat: 26.07, lng: 50.56 },
  { name: 'Sudan', iso: 'SD', lat: 12.86, lng: 30.22 },
  { name: 'Ethiopia', iso: 'ET', lat: 9.15, lng: 40.49 },
  { name: 'Kenya', iso: 'KE', lat: -0.02, lng: 37.91 },
  { name: 'Uganda', iso: 'UG', lat: 1.37, lng: 32.29 },
  { name: 'Nigeria', iso: 'NG', lat: 9.08, lng: 8.68 },
  { name: 'Ghana', iso: 'GH', lat: 7.95, lng: -1.02 },
  { name: 'Morocco', iso: 'MA', lat: 31.79, lng: -7.09 },
  { name: 'Tunisia', iso: 'TN', lat: 33.89, lng: 9.54 },
  { name: 'Turkey', iso: 'TR', lat: 38.96, lng: 35.24 },
  { name: 'United Kingdom', iso: 'GB', lat: 55.38, lng: -3.44 },
  { name: 'United States', iso: 'US', lat: 37.09, lng: -95.71 },
];

const ALIASES: Record<string, string> = {
  india: 'IN',
  indian: 'IN',
  ind: 'IN',
  bharat: 'IN',
  pakistan: 'PK',
  pakistani: 'PK',
  pak: 'PK',
  bangladesh: 'BD',
  bangladeshi: 'BD',
  bangla: 'BD',
  nepal: 'NP',
  nepali: 'NP',
  nepalese: 'NP',
  philippines: 'PH',
  philippine: 'PH',
  filipino: 'PH',
  filipina: 'PH',
  pinoy: 'PH',
  uae: 'AE',
  'u.a.e': 'AE',
  'u.a.e.': 'AE',
  emirati: 'AE',
  emarian: 'AE',
  'united arab emirates': 'AE',
  'sri lanka': 'LK',
  srilanka: 'LK',
  'sri lankan': 'LK',
  srilankan: 'LK',
  ceylon: 'LK',
  egypt: 'EG',
  egyptian: 'EG',
  china: 'CN',
  chinese: 'CN',
  indonesia: 'ID',
  indonesian: 'ID',
  afghanistan: 'AF',
  afghan: 'AF',
  iran: 'IR',
  iranian: 'IR',
  persian: 'IR',
  jordan: 'JO',
  jordanian: 'JO',
  lebanon: 'LB',
  lebanese: 'LB',
  syria: 'SY',
  syrian: 'SY',
  yemen: 'YE',
  yemeni: 'YE',
  oman: 'OM',
  omani: 'OM',
  qatar: 'QA',
  qatari: 'QA',
  'saudi arabia': 'SA',
  saudi: 'SA',
  ksa: 'SA',
  kuwait: 'KW',
  kuwaiti: 'KW',
  bahrain: 'BH',
  bahraini: 'BH',
  sudan: 'SD',
  sudanese: 'SD',
  ethiopia: 'ET',
  ethiopian: 'ET',
  kenya: 'KE',
  kenyan: 'KE',
  uganda: 'UG',
  ugandan: 'UG',
  nigeria: 'NG',
  nigerian: 'NG',
  ghana: 'GH',
  ghanaian: 'GH',
  morocco: 'MA',
  moroccan: 'MA',
  tunisia: 'TN',
  tunisian: 'TN',
  turkey: 'TR',
  turkish: 'TR',
  'united kingdom': 'GB',
  uk: 'GB',
  british: 'GB',
  english: 'GB',
  'united states': 'US',
  usa: 'US',
  american: 'US',
};

const BY_ISO = new Map(COUNTRIES.map((country) => [country.iso, country]));

function normalizeNationality(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function resolveCountryFromNationality(
  nationality: string | null | undefined,
): CountryGeo | null {
  const raw = String(nationality || '').trim();
  if (!raw) {
    return null;
  }
  const key = normalizeNationality(raw);
  const iso =
    ALIASES[key] ||
    (key.length === 2 ? key.toUpperCase() : '') ||
    COUNTRIES.find((country) => country.name.toLowerCase() === key)?.iso;
  if (!iso) {
    return null;
  }
  return BY_ISO.get(iso) ?? null;
}
