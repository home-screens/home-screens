/**
 * Guessing which aisle a typed-in ingredient belongs to.
 *
 * The shopping list groups by aisle, but the category is a fourth control on a
 * form row that already takes three taps, so a hurried parent never sets it and
 * every item landed under one OTHER heading: a flat list with a pointless
 * header on it.
 *
 * Keywords for every shipped language sit in one table rather than behind a
 * locale parameter. A household types in its own language whatever the
 * interface is set to, the lists barely collide, and it keeps the four callers
 * of `generateGroceryList` (including the API route) free of a locale they
 * would otherwise have to thread through.
 *
 * Matching rules, which the keyword lengths below assume:
 *  - a keyword of four characters or fewer matches only as a whole word, or
 *    as that word with an "s" on the end, so "corn" does not claim
 *    "cornflour" and French "ail" does not claim "cocktail", while "egg"
 *    still finds "eggs" and "lime" finds "limes". A short word whose plural
 *    is not a plain "s" ("chou", "choux") carries its plural as a keyword of
 *    its own;
 *  - a longer keyword also matches inside a word, which is what German, Dutch
 *    and Danish compounds need ("Hähnchenbrust", "kikkererwten");
 *  - the longest matching keyword wins, so "orange juice" is a drink while
 *    "orange" alone is fruit, and "watermelon" is fruit rather than water.
 *
 * A guess is only ever used when the ingredient carries no category of its own,
 * and the row's own select still overrides it.
 */

export type GroceryCategory =
  | 'produce' | 'meat' | 'dairy' | 'bakery' | 'pantry' | 'frozen' | 'beverages';

/** Keywords per aisle, across every shipped language. */
export const GROCERY_KEYWORDS: Record<GroceryCategory, readonly string[]> = {
  produce: [
    // en
    'apple', 'banana', 'berries', 'blueberr', 'strawberr', 'raspberr', 'lettuce',
    'spinach', 'kale', 'tomato', 'potato', 'onion', 'garlic', 'carrot', 'celery',
    'bell pepper', 'peppers', 'broccoli', 'cucumber', 'mushroom', 'avocado',
    'lemon', 'lime', 'orange', 'grape', 'salad', 'parsley', 'cilantro', 'basil',
    'zucchini', 'squash', 'corn', 'peas', 'green bean', 'cabbage', 'cauliflower',
    'ginger', 'watermelon', 'melon', 'pear', 'peach', 'plum', 'cherry', 'mango',
    // de
    'apfel', 'äpfel', 'banane', 'beeren', 'erdbeer', 'blaubeer', 'kartoffel',
    'zwiebel', 'knoblauch', 'karotte', 'möhre', 'sellerie', 'paprika', 'gurke',
    'pilz', 'champignon', 'zitrone', 'trauben', 'petersilie', 'basilikum',
    'kürbis', 'mais', 'erbsen', 'kohl', 'blumenkohl', 'ingwer', 'spinat', 'pilze',
    // fr
    'pomme', 'fraise', 'myrtille', 'épinard', 'oignon', 'carotte', 'céleri',
    'poivron', 'concombre', 'avocat',
    'persil', 'courgette', 'courge', 'maïs', 'petits pois', 'chou', 'choux', 'gingembre',
    'salade', 'tomate', 'patate',
    // es
    'manzana', 'plátano', 'fresa', 'arándano', 'lechuga', 'espinaca', 'cebolla',
    'ajo', 'zanahoria', 'apio', 'pimiento', 'brócoli', 'pepino', 'champiñón',
    'aguacate', 'limón', 'naranja', 'uva', 'perejil', 'albahaca', 'calabacín',
    'calabaza', 'guisante', 'jengibre', 'papa',
    // nl
    'appel', 'banaan', 'aardbei', 'bosbes', 'sla', 'spinazie', 'tomaat',
    'aardappel', 'uien', 'knoflook', 'wortel', 'selderij', 'komkommer',
    'citroen', 'sinaasappel', 'druif', 'peterselie', 'pompoen', 'erwt',
    'bloemkool', 'gember', 'erwten',
    // pt
    'maçã', 'morango', 'alface', 'espinafre', 'batata', 'alho', 'cenoura',
    'aipo', 'pimentão', 'brócolis', 'cogumelo', 'abacate', 'limão', 'laranja',
    'salsinha', 'manjericão', 'abobrinha', 'abóbora', 'milho', 'ervilha',
    'repolho', 'couve', 'gengibre',
    // da
    'æble', 'æbler', 'jordbær', 'blåbær', 'løg', 'hvidløg', 'gulerod',
    'peberfrugt', 'agurk', 'appelsin', 'drue', 'druer', 'persille', 'græskar',
    'majs', 'ærter', 'kål', 'ingefær',
  ],
  meat: [
    // en
    'beef', 'chicken', 'pork', 'bacon', 'sausage', 'turkey', 'ham', 'steak',
    'mince', 'lamb', 'salmon', 'shrimp', 'prawn', 'tuna', 'cod', 'fish',
    'meatball', 'chorizo', 'ribs', 'brisket',
    // de
    'rindfleisch', 'hähnchen', 'hühnchen', 'hühner', 'schwein', 'speck', 'wurst', 'pute',
    'schinken', 'hackfleisch', 'lamm', 'lachs', 'garnele', 'thunfisch', 'fisch',
    'frikadelle',
    // fr
    'boeuf', 'bœuf', 'poulet', 'porc', 'lardon', 'saucisse', 'dinde', 'jambon',
    'haché', 'agneau', 'saumon', 'crevette', 'thon', 'poisson',
    // es
    'ternera', 'pollo', 'cerdo', 'tocino', 'salchicha', 'pavo', 'jamón',
    'filete', 'picada', 'cordero', 'salmón', 'gamba', 'atún', 'pescado', 'carne',
    // nl
    'rundvlees', 'kip', 'varken', 'spek', 'worst', 'kalkoen', 'biefstuk',
    'gehakt', 'zalm', 'garnaal', 'tonijn',
    // pt
    'frango', 'porco', 'linguiça', 'peru', 'presunto', 'bife', 'moída',
    'camarão', 'peixe',
    // da
    'oksekød', 'kylling', 'svinekød', 'pølse', 'kalkun', 'skinke', 'bøf',
    'hakket', 'laks', 'rejer', 'tunfisk',
  ],
  dairy: [
    // en
    'milk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'yogurt', 'yoghurt',
    'butter', 'cream', 'egg', 'feta', 'ricotta',
    // de
    'milch', 'käse', 'joghurt', 'sahne', 'quark', 'eier', 'schmand',
    // fr
    'lait', 'fromage', 'yaourt', 'beurre', 'crème', 'oeuf', 'œuf',
    // es
    'leche', 'queso', 'yogur', 'mantequilla', 'nata', 'huevo',
    // nl
    'melk', 'kaas', 'boter', 'eieren', 'kwark', 'slagroom',
    // pt
    'leite', 'queijo', 'iogurte', 'manteiga', 'requeijão', 'ovos', 'ovo',
    // da
    'mælk', 'ost', 'smør', 'fløde', 'skyr', 'æg',
  ],
  bakery: [
    // en
    'bread', 'roll', 'bun', 'baguette', 'tortilla', 'pita', 'bagel',
    'croissant', 'naan', 'wrap',
    // de
    'brot', 'brötchen', 'semmel', 'toast',
    // fr
    'pain', 'brioche',
    // es
    'barra de pan', 'bollo',
    // nl
    'brood', 'broodje', 'stokbrood', 'beschuit',
    // pt
    'pão', 'pães', 'baguete', 'torrada',
    // da
    'rundstykke', 'knækbrød', 'flutes',
  ],
  pantry: [
    // en
    'rice', 'pasta', 'spaghetti', 'noodle', 'flour', 'sugar', 'salt', 'oil',
    'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'beans', 'lentil',
    'chickpea', 'stock', 'broth', 'spice', 'cinnamon', 'oats', 'cereal',
    'honey', 'peanut butter', 'jam', 'coconut milk', 'soy sauce',
    'tomato paste', 'breadcrumb', 'baking powder', 'yeast', 'chocolate',
    'almond', 'walnut', 'stock cube',
    // Broth made from meat is a carton or a cube on the shelf. These are longer
    // than the meat word they hold, so they win over it ("chicken" is longer
    // than "broth"; see the matching rules above).
    'chicken broth', 'chicken stock', 'beef broth', 'beef stock',
    // de
    'reis', 'nudel', 'mehl', 'zucker', 'salz', 'essig', 'soße', 'senf',
    'bohnen', 'linsen', 'kichererbsen', 'brühe', 'gewürz', 'zimt',
    'haferflocken', 'müsli', 'honig', 'marmelade', 'schokolade', 'mandeln',
    'rosinen', 'hefe', 'backpulver', 'paniermehl', 'hühnerbrühe', 'hühnchenbrühe',
    'hähnchenbrühe', 'rinderbrühe',
    // fr
    'riz', 'pâtes', 'farine', 'sucre', 'sel', 'huile', 'vinaigre', 'moutarde',
    'haricot', 'lentille', 'pois chiche', 'épice', 'cannelle',
    'flocons', 'céréale', 'miel', 'confiture', 'chocolat', 'amande',
    'levure', 'chapelure',
    // fr, nl, da: "bouillon de poulet", "kippenbouillon", "hønsebouillon"
    'bouillon',
    // es
    'arroz', 'harina', 'azúcar', 'aceite', 'vinagre', 'salsa', 'mostaza',
    'alubia', 'judía', 'lenteja', 'garbanzo', 'caldo', 'especia', 'canela',
    'avena', 'mermelada', 'almendra', 'levadura', 'pan rallado',
    // es, pt: as long as "pollo" or longer than "frango", so name the broth whole
    'caldo de pollo', 'caldo de carne', 'caldo de frango', 'caldo de galinha',
    // nl
    'rijst', 'bloem', 'suiker', 'zout', 'olie', 'azijn', 'saus', 'mosterd',
    'bonen', 'linzen', 'kikkererwt', 'kruiden', 'kaneel',
    'havermout', 'muesli', 'honing', 'chocola', 'amandel', 'rozijn', 'gist',
    'paneermeel',
    // pt
    'macarrão', 'farinha', 'açúcar', 'óleo', 'azeite', 'molho', 'feijão',
    'lentilha', 'grão de bico', 'tempero', 'aveia', 'geleia', 'amêndoa',
    'fermento', 'farinha de rosca',
    // da
    'mel', 'sukker', 'eddike', 'sennep', 'bønner', 'linser',
    'kikærter', 'krydderi', 'kanel', 'havregryn', 'honning', 'chokolade',
    'mandler', 'rosiner', 'gær', 'rasp',
  ],
  frozen: [
    'frozen', 'ice cream', 'tiefkühl', 'gefroren', 'surgelé', 'congelé',
    'congelado', 'helado', 'sorvete', 'diepvries', 'bevroren', 'frossen',
    'frostvarer', 'glace',
  ],
  beverages: [
    // en
    'juice', 'orange juice', 'apple juice', 'coffee', 'tea', 'soda', 'water',
    'wine', 'beer', 'cola', 'lemonade', 'smoothie', 'sparkling water',
    // de
    'saft', 'kaffee', 'limonade', 'wasser', 'wein', 'bier',
    // fr
    'jus', 'café', 'thé', 'eau', 'eaux', 'vin', 'bière',
    // es
    'zumo', 'jugo', 'refresco', 'agua', 'vino', 'cerveza',
    // nl
    'koffie', 'thee', 'wijn', 'frisdrank',
    // pt
    'suco', 'chá', 'refrigerante', 'água', 'vinho',
    // da
    'kaffe', 'sodavand', 'vand', 'øl',
  ],
};

/** Below this length a keyword only matches as a whole word, or that word plus "s". */
const SUBSTRING_MIN_LENGTH = 5;

interface Candidate { keyword: string; category: GroceryCategory }

/** Every keyword, longest first, so the most specific match wins. */
const CANDIDATES: Candidate[] = Object.entries(GROCERY_KEYWORDS)
  .flatMap(([category, words]) =>
    words.map((keyword) => ({ keyword, category: category as GroceryCategory })))
  .sort((a, b) => b.keyword.length - a.keyword.length);

/** Punctuation and digits out, so "2 lbs chicken-thighs" reads as words. */
function normalize(name: string): string {
  return ` ${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

/**
 * The aisle a typed ingredient most likely belongs to, or null when nothing
 * matches. Never guesses over a category the household set itself.
 */
export function guessGroceryCategory(name: string): GroceryCategory | null {
  const haystack = normalize(name);
  for (const { keyword, category } of CANDIDATES) {
    if (keyword.length >= SUBSTRING_MIN_LENGTH) {
      if (haystack.includes(keyword)) return category;
    } else if (haystack.includes(` ${keyword} `) || haystack.includes(` ${keyword}s `)) {
      return category;
    }
  }
  return null;
}
