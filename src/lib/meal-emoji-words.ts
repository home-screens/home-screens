import { FOOD_EMOJIS } from './meal-constants';

/**
 * Words a family might type to find each food emoji in the editor's meal
 * form, in the seven languages Home Screens ships (English, German, French,
 * Spanish, Dutch, Portuguese, Danish). One list for every language, as the
 * Mealie category words in `meal-dish-rules.ts` are: "kaas" finds the cheese
 * whatever language the editor is in, and so does "cheese".
 */
const EMOJI_WORDS: Record<string, string> = {
  '🍳': 'eggs fried breakfast spiegelei ei frühstück œuf oeuf petit-déjeuner huevo desayuno gebakken ontbijt ovo café da manhã æg morgenmad',
  '🥞': 'pancakes breakfast pfannkuchen frühstück crêpes tortitas panqueques pannenkoeken ontbijt panquecas pandekager morgenmad',
  '🧇': 'waffle breakfast waffel gaufre gofre wafel vaffel',
  '🥣': 'cereal oatmeal porridge breakfast bowl müsli haferbrei schüssel céréales bol cereales avena kom havermout pap aveia tigela grød havregryn skål',
  '🥗': 'salad healthy vegetables salat gesund gemüse salade légumes ensalada verduras sla groente salada legumes grøntsager',
  '🥪': 'sandwich lunch belegtes brot mittagessen déjeuner bocadillo almuerzo boterham broodje sanduíche almoço frokost',
  '🌮': 'taco mexican mexikanisch mexicain mexicano mexicaans mexicansk',
  '🌯': 'burrito wrap mexican mexikanisch mexicain mexicano mexicaans mexicansk',
  '🍕': 'pizza italian italienisch italien italiano italiaans italiana italiensk',
  '🍔': 'burger hamburger hamburguesa hambúrguer',
  '🍝': 'pasta spaghetti italian nudeln italienisch pâtes italien espaguetis italiano italiaans macarrão massa italiana italiensk',
  '🍜': 'noodles ramen soup asian nudeln suppe asiatisch nouilles soupe asiatique fideos sopa asiático noedels soep aziatisch macarrão nudler asiatisk',
  '🍲': 'stew soup pot eintopf suppe topf ragoût soupe marmite guiso estofado sopa olla stoofpot soep pan ensopado panela gryderet gryde',
  '🥘': 'curry casserole pan paella auflauf pfanne gratin poêle cazuela sartén ovenschotel caçarola frigideira pande',
  '🍛': 'curry rice indian reis indisch riz indien arroz indio rijst indiaas indiano karry ris indisk',
  '🍣': 'sushi japanese fish japanisch fisch japonais poisson japonés pescado japans vis japonês peixe japansk fisk',
  '🍱': 'bento japanese box lunchbox japanisch japonais boîte japonés caja japans japonês marmita japansk madkasse',
  '🥩': 'steak meat beef fleisch rind viande bœuf boeuf carne filete ternera vlees biefstuk rund bife bøf kød oksekød',
  '🍗': 'chicken poultry drumstick hähnchen huhn geflügel poulet volaille pollo kip frango kylling',
  '🐟': 'fish seafood fisch meeresfrüchte poisson fruits de mer pescado marisco vis zeevruchten peixe frutos do mar fisk skaldyr',
  '🥦': 'broccoli vegetable green brokkoli gemüse brocoli légume brócoli verdura groente brócolis legume grøntsag',
  '🥕': 'carrot vegetable karotte möhre gemüse carotte légume zanahoria verdura wortel groente cenoura legume gulerod grøntsag',
  '🌽': 'corn vegetable mais gemüse maïs légume maíz verdura groente milho legume majs grøntsag',
  '🥑': 'avocado guacamole avocat aguacate abacate',
  '🍅': 'tomato vegetable tomate gemüse légume verdura tomaat groente legume tomat grøntsag',
  '🫑': 'pepper vegetable bell pepper paprika gemüse poivron légume pimiento verdura groente pimentão legume peberfrugt grøntsag',
  '🧀': 'cheese dairy käse milchprodukt fromage queso lácteo kaas zuivel queijo laticínio ost mejeri',
  '🥚': 'egg breakfast ei frühstück œuf oeuf huevo desayuno ontbijt ovo æg morgenmad',
  '🍞': 'bread toast bakery brot bäckerei pain boulangerie pan tostada panadería brood bakkerij pão torrada padaria brød bageri',
  '🥐': 'croissant pastry bakery breakfast gebäck bäckerei frühstück viennoiserie boulangerie cruasán bollería gebak bakkerij folhado padaria bagværk bageri',
  '🍰': 'cake dessert kuchen torte nachtisch gâteau tarta pastel postre taart toetje bolo sobremesa kage',
  '🧁': 'cupcake muffin dessert nachtisch magdalena postre toetje sobremesa',
  '🍪': 'cookie biscuit dessert snack keks plätzchen galleta koekje biscoito bolacha småkage',
  '🍩': 'donut doughnut dessert krapfen beignet rosquilla dona rosquinha',
  '🍫': 'chocolate dessert candy schokolade süßigkeit chocolat bonbon dulce chocolade snoep doce chokolade slik',
  '🥤': 'drink soda smoothie beverage getränk limonade boisson bebida refresco drankje frisdrank refrigerante drik sodavand',
  '☕': 'coffee drink beverage hot kaffee getränk heiß café boisson chaud bebida caliente koffie drankje quente kaffe drik varm',
  '🍵': 'tea drink beverage hot tee getränk thé boisson té bebida thee drankje chá te drik',
  '🧃': 'juice drink beverage saft getränk jus boisson zumo jugo bebida sap drankje suco drik',
  '🥛': 'milk drink dairy beverage milch getränk lait boisson leche bebida melk drankje leite mælk drik',
  '🥧': 'pie dessert tart kuchen nachtisch tarte tarta pastel postre taart toetje torta sobremesa tærte',
  '🍿': 'popcorn snack pop-corn palomitas pipoca',
  '🥜': 'peanuts nuts snack erdnüsse nüsse cacahuètes noix cacahuetes frutos secos pinda noten amendoim nozes jordnødder nødder',
  '🫘': 'beans legumes bohnen hülsenfrüchte haricots légumineuses frijoles alubias judías legumbres bonen peulvruchten feijão bønner',
  '🍓': 'strawberry fruit berry erdbeere obst beere fraise fresa fruta aardbei morango jordbær frugt bær',
  '🍌': 'banana fruit banane obst plátano fruta banaan banan frugt',
  '🍎': 'apple fruit apfel obst pomme manzana fruta appel maçã æble frugt',
  '🥝': 'kiwi fruit obst fruta frugt',
};

/**
 * The food emoji the typed words name, in the grid's own order; every emoji
 * while nothing is typed.
 */
export function searchFoodEmojis(query: string): string[] {
  const q = query.trim().toLowerCase();
  const all = FOOD_EMOJIS as readonly string[];
  if (!q) return [...all];
  return all.filter((emoji) => EMOJI_WORDS[emoji]?.includes(q));
}

/** Every emoji in the grid has words; for the test. */
export const FOOD_EMOJI_WORDS: Readonly<Record<string, string>> = EMOJI_WORDS;
