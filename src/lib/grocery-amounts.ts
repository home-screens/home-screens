/**
 * Adding up the amounts the grocery list gathers for one item.
 *
 * An amount is whatever the family typed beside an ingredient: "2 lb",
 * "1 1/2 cups", "½ cup", "a pinch". A week with ground beef in three meals used
 * to list "2 lb, 2 lb, 1 lb"; amounts in the same unit are added up instead
 * ("5 lb"). Only a whole number, a decimal or a simple fraction followed by a
 * unit is added. Anything else ("a pinch", "2-3 cloves", "1 (15 oz) can") is
 * kept as typed and listed beside the totals, and units are never converted:
 * a pound and some ounces stay two amounts.
 *
 * Like the aisle keywords in `grocery-categories.ts`, the unit words of every
 * shipped language sit in one table rather than behind a locale parameter: a
 * household types its amounts in its own language whatever the interface is
 * set to.
 */

/** A quantity as an exact fraction, so a third plus two thirds is one. */
interface Fraction {
  n: number;
  d: number;
}

const UNICODE_FRACTIONS: Record<string, Fraction> = {
  '½': { n: 1, d: 2 }, '⅓': { n: 1, d: 3 }, '⅔': { n: 2, d: 3 }, '¼': { n: 1, d: 4 }, '¾': { n: 3, d: 4 },
  '⅕': { n: 1, d: 5 }, '⅖': { n: 2, d: 5 }, '⅗': { n: 3, d: 5 }, '⅘': { n: 4, d: 5 }, '⅙': { n: 1, d: 6 },
  '⅚': { n: 5, d: 6 }, '⅛': { n: 1, d: 8 }, '⅜': { n: 3, d: 8 }, '⅝': { n: 5, d: 8 }, '⅞': { n: 7, d: 8 },
};
const GLYPHS = Object.keys(UNICODE_FRACTIONS).join('');

/**
 * Count words whose plural is not the word plus a letter or two ("loaf",
 * "loaves"), and the common ones a total needs in the plural when every meal
 * asked for one ("1 can" twice is "2 cans"). Lowercase, singular first. A word
 * two languages pluralise differently ("pot", "kop") is matched either way but
 * left as typed in a total.
 */
const UNIT_PLURALS: readonly (readonly [string, string])[] = [
  // English
  ['bag', 'bags'], ['ball', 'balls'], ['bar', 'bars'], ['block', 'blocks'], ['bottle', 'bottles'], ['box', 'boxes'],
  ['bunch', 'bunches'], ['can', 'cans'], ['carton', 'cartons'], ['clove', 'cloves'], ['container', 'containers'],
  ['cup', 'cups'], ['fillet', 'fillets'], ['handful', 'handfuls'], ['head', 'heads'], ['jar', 'jars'],
  ['loaf', 'loaves'], ['pack', 'packs'], ['package', 'packages'], ['packet', 'packets'], ['piece', 'pieces'],
  ['pinch', 'pinches'], ['pouch', 'pouches'], ['slice', 'slices'], ['sprig', 'sprigs'], ['stalk', 'stalks'],
  ['stick', 'sticks'], ['tablespoon', 'tablespoons'], ['teaspoon', 'teaspoons'], ['tin', 'tins'], ['tub', 'tubs'],
  // German
  ['dose', 'dosen'], ['packung', 'packungen'], ['flasche', 'flaschen'], ['glas', 'gläser'], ['tasse', 'tassen'],
  ['zehe', 'zehen'], ['scheibe', 'scheiben'], ['prise', 'prisen'], ['tüte', 'tüten'], ['kopf', 'köpfe'],
  ['laib', 'laibe'], ['knolle', 'knollen'], ['stange', 'stangen'], ['tafel', 'tafeln'], ['schale', 'schalen'],
  // French
  ['boîte', 'boîtes'], ['sachet', 'sachets'], ['bouteille', 'bouteilles'], ['pot', 'pots'], ['gousse', 'gousses'],
  ['tranche', 'tranches'], ['botte', 'bottes'], ['pincée', 'pincées'], ['paquet', 'paquets'], ['tête', 'têtes'],
  ['cuillère', 'cuillères'], ['brique', 'briques'],
  // Spanish and Portuguese
  ['lata', 'latas'], ['bolsa', 'bolsas'], ['botella', 'botellas'], ['taza', 'tazas'], ['diente', 'dientes'],
  ['rebanada', 'rebanadas'], ['manojo', 'manojos'], ['pizca', 'pizcas'], ['paquete', 'paquetes'],
  ['cucharada', 'cucharadas'], ['cucharadita', 'cucharaditas'], ['frasco', 'frascos'], ['caja', 'cajas'],
  ['pacote', 'pacotes'], ['garrafa', 'garrafas'], ['xícara', 'xícaras'], ['dente', 'dentes'], ['fatia', 'fatias'],
  ['maço', 'maços'], ['pitada', 'pitadas'], ['colher', 'colheres'], ['caixa', 'caixas'], ['pão', 'pães'],
  // Dutch
  ['blik', 'blikken'], ['zak', 'zakken'], ['fles', 'flessen'], ['kop', 'koppen'], ['teen', 'tenen'],
  ['plak', 'plakken'], ['bos', 'bossen'], ['pak', 'pakken'], ['pot', 'potten'], ['doos', 'dozen'],
  ['krop', 'kroppen'], ['brood', 'broden'], ['eetlepel', 'eetlepels'], ['theelepel', 'theelepels'],
  // Danish
  ['dåse', 'dåser'], ['pose', 'poser'], ['flaske', 'flasker'], ['kop', 'kopper'], ['skive', 'skiver'],
  ['bundt', 'bundter'], ['pakke', 'pakker'], ['spiseske', 'spiseskeer'], ['teske', 'teskeer'], ['hoved', 'hoveder'],
  ['bakke', 'bakker'], ['rulle', 'ruller'], ['stykke', 'stykker'],
];

const PLURALS_OF = new Map<string, Set<string>>();
for (const [one, many] of UNIT_PLURALS) {
  if (!PLURALS_OF.has(one)) PLURALS_OF.set(one, new Set());
  PLURALS_OF.get(one)!.add(many);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function reduce(n: number, d: number): Fraction {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

function add(a: Fraction, b: Fraction): Fraction {
  return reduce(a.n * b.d + b.n * a.d, a.d * b.d);
}

/** One typed amount read as a number and a unit, or null when it is not one we can add. */
interface ReadAmount {
  quantity: Fraction;
  unit: string;
  /** The number was written as a fraction ("1/2", "½"). */
  fraction: boolean;
  /** The number was written with a decimal point or comma ("1.5", "1,5"). */
  decimal: boolean;
  comma: boolean;
}

const QUANTITY_PATTERNS: readonly [RegExp, (m: RegExpMatchArray) => Omit<ReadAmount, 'unit'> | null][] = [
  // 1 1/2
  [/^(\d+)\s+(\d+)\/(\d+)/, (m) => fractionOf(+m[1] * +m[3] + +m[2], +m[3])],
  // 1½, 1 ½
  [new RegExp(`^(\\d+)\\s*([${GLYPHS}])`), (m) => {
    const f = UNICODE_FRACTIONS[m[2]];
    return { quantity: reduce(+m[1] * f.d + f.n, f.d), fraction: true, decimal: false, comma: false };
  }],
  // ½
  [new RegExp(`^([${GLYPHS}])`), (m) => ({ quantity: UNICODE_FRACTIONS[m[1]], fraction: true, decimal: false, comma: false })],
  // 1/2
  [/^(\d+)\/(\d+)/, (m) => fractionOf(+m[1], +m[2])],
  // 1.5, 1,5. Three digits after the mark is a thousands separator in some
  // languages and a decimal in others ("1,500"), so that is left as typed.
  [/^(\d+)([.,])(\d+)/, (m) => m[3].length === 3 ? null : {
    quantity: reduce(+(m[1] + m[3]), 10 ** m[3].length),
    fraction: false,
    decimal: true,
    comma: m[2] === ',',
  }],
  // 2
  [/^(\d+)/, (m) => ({ quantity: { n: +m[1], d: 1 }, fraction: false, decimal: false, comma: false })],
];

function fractionOf(n: number, d: number): Omit<ReadAmount, 'unit'> | null {
  return d === 0 ? null : { quantity: reduce(n, d), fraction: true, decimal: false, comma: false };
}

function readAmount(text: string): ReadAmount | null {
  for (const [pattern, toQuantity] of QUANTITY_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    const read = toQuantity(m);
    if (!read) return null;
    const unit = text.slice(m[0].length).trim().replace(/\s+/g, ' ');
    // A unit is words: "cups", "large cans". Anything with a number or a mark
    // in front ("-3 cloves", "to 3 cups", "(15 oz) can") is a range or a note,
    // which cannot be added.
    if (unit && (!/^\p{L}/u.test(unit) || /\d/.test(unit))) return null;
    return { ...read, unit };
  }
  return null;
}

function unitWords(unit: string): string[] {
  return unit ? unit.toLowerCase().split(' ').map((w) => w.replace(/\.$/, '')) : [];
}

/** The same unit word give or take a plural ending: "can" and "cans", "Dose" and "Dosen", "loaf" and "loaves". */
function sameUnitWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (PLURALS_OF.get(short)?.has(long)) return true;
  if (long === `${short}s`) return true;
  // A letter or two more on a word of three or more ("bunch", "bunches"); a
  // shorter one is an abbreviation, and "l" is not "lb".
  return short.length >= 3 && long.startsWith(short) && long.length - short.length <= 2;
}

function sameUnit(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((word, i) => sameUnitWord(word, b[i]));
}

function isPlural(q: Fraction): boolean {
  return q.n > q.d;
}

/** The unit as a total of `total` should read: as the family wrote it for that many, or put in the plural when we know how. */
function unitFor(total: Fraction, seen: readonly ReadAmount[]): string {
  const many = isPlural(total);
  const written = seen.find((a) => isPlural(a.quantity) === many);
  if (written || !many) return (written ?? seen[0]).unit;
  return seen[0].unit
    .split(' ')
    .map((word) => {
      const plurals = PLURALS_OF.get(word.toLowerCase().replace(/\.$/, ''));
      if (!plurals || plurals.size !== 1) return word;
      const [plural] = plurals;
      return word[0] === word[0].toUpperCase() ? plural[0].toUpperCase() + plural.slice(1) : plural;
    })
    .join(' ');
}

function formatQuantity(q: Fraction, seen: readonly ReadAmount[]): string {
  if (q.d === 1) return String(q.n);
  if (!seen.some((a) => a.decimal)) {
    const whole = Math.floor(q.n / q.d);
    const part = `${q.n % q.d}/${q.d}`;
    return whole > 0 ? `${whole} ${part}` : part;
  }
  const text = String(Math.round((q.n / q.d) * 100) / 100);
  return seen.some((a) => a.comma) ? text.replace('.', ',') : text;
}

/** An amount that cannot be added, kept as typed. */
interface KeptAmount {
  text: string;
}

/** Amounts in one unit, added up into one. */
interface AmountGroup {
  unit: string[];
  seen: ReadAmount[];
  texts: string[];
}

/**
 * The amounts one grocery item gathered from the week's meals, as one line:
 * those in the same unit added up, the rest kept as typed, in the order they
 * first came. Empty amounts are left out.
 */
export function sumGroceryAmounts(amounts: readonly string[]): string {
  const parts: (KeptAmount | AmountGroup)[] = [];
  for (const raw of amounts) {
    const text = raw.trim();
    if (!text) continue;
    const read = readAmount(text);
    if (!read) {
      parts.push({ text });
      continue;
    }
    const unit = unitWords(read.unit);
    const group = parts.find((p): p is AmountGroup => 'unit' in p && sameUnit(p.unit, unit));
    if (group) {
      group.seen.push(read);
      group.texts.push(text);
    } else {
      parts.push({ unit, seen: [read], texts: [text] });
    }
  }
  return parts
    .map((part) => {
      if ('text' in part) return part.text;
      // One amount in its unit is shown exactly as it was typed.
      if (part.seen.length === 1) return part.texts[0];
      const total = part.seen.reduce((sum, a) => add(sum, a.quantity), { n: 0, d: 1 } as Fraction);
      const unit = unitFor(total, part.seen);
      const quantity = formatQuantity(total, part.seen);
      return unit ? `${quantity} ${unit}` : quantity;
    })
    .join(', ');
}
