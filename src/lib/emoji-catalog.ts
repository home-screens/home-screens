/**
 * Curated emoji catalog for the shared icon picker.
 *
 * Deliberately a hand-picked few hundred rather than the full Unicode set:
 * these fields label calendar events and day badges for a household, so the
 * useful range is school/sport/chore/food/weather, and a scannable grid beats
 * an exhaustive one. Font Awesome's tab covers anything missing here.
 *
 * `n` is the searchable name and `kw` the extra aliases that aren't already
 * in it, so typing "football" finds ⚽ and "doctor" finds 🩺. Both are English
 * in every locale, matching the untranslated icon names the Font Awesome grid
 * has always shown.
 */

export interface EmojiEntry {
  /** The glyph itself — this is what gets stored in config. */
  e: string;
  /** Searchable name, also shown as the picker tile's tooltip. */
  n: string;
  /** Extra search aliases not already contained in `n`. */
  kw?: readonly string[];
}

export interface EmojiGroup {
  /** Translation key suffix under `editor:iconPicker.emojiGroups`. */
  id: string;
  icons: readonly EmojiEntry[];
}

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    id: 'popular',
    icons: [
      { e: '⭐', n: 'star', kw: ['favorite', 'special'] },
      { e: '❤️', n: 'heart', kw: ['love', 'like'] },
      { e: '🎉', n: 'party popper', kw: ['celebrate', 'yay', 'congrats'] },
      { e: '🔥', n: 'fire', kw: ['hot', 'streak'] },
      { e: '✨', n: 'sparkles', kw: ['new', 'shiny', 'clean'] },
      { e: '📌', n: 'pushpin', kw: ['important', 'pinned'] },
      { e: '✅', n: 'check mark', kw: ['done', 'yes', 'complete'] },
      { e: '⚠️', n: 'warning', kw: ['caution', 'careful'] },
      { e: '🎯', n: 'target', kw: ['goal', 'aim', 'bullseye'] },
      { e: '💡', n: 'light bulb', kw: ['idea', 'tip'] },
      { e: '🏠', n: 'house', kw: ['home'] },
      { e: '🎵', n: 'music note', kw: ['song', 'lesson'] },
      { e: '📅', n: 'calendar', kw: ['date', 'schedule'] },
      { e: '⏰', n: 'alarm clock', kw: ['time', 'wake', 'reminder'] },
      { e: '❗', n: 'exclamation', kw: ['important', 'urgent'] },
      { e: '❓', n: 'question mark', kw: ['unsure', 'maybe'] },
      { e: '🚫', n: 'no entry', kw: ['cancelled', 'off', 'closed'] },
      { e: '💤', n: 'sleep', kw: ['nap', 'bedtime', 'zzz'] },
    ],
  },
  {
    id: 'people',
    icons: [
      { e: '😀', n: 'grinning face', kw: ['happy', 'smile'] },
      { e: '😍', n: 'heart eyes', kw: ['love', 'favorite'] },
      { e: '😎', n: 'sunglasses face', kw: ['cool'] },
      { e: '🥳', n: 'partying face', kw: ['birthday', 'celebrate'] },
      { e: '😴', n: 'sleeping face', kw: ['tired', 'bedtime', 'nap'] },
      { e: '🤒', n: 'sick face', kw: ['ill', 'fever', 'home sick'] },
      { e: '😅', n: 'nervous face', kw: ['busy', 'phew'] },
      { e: '🙂', n: 'slight smile', kw: ['ok', 'fine'] },
      { e: '👋', n: 'waving hand', kw: ['hello', 'goodbye'] },
      { e: '👍', n: 'thumbs up', kw: ['yes', 'good', 'approved'] },
      { e: '👏', n: 'clapping hands', kw: ['well done', 'praise'] },
      { e: '🙌', n: 'raising hands', kw: ['hooray', 'celebrate'] },
      { e: '💪', n: 'flexed arm', kw: ['strong', 'workout', 'gym'] },
      { e: '🤝', n: 'handshake', kw: ['meeting', 'deal'] },
      { e: '👶', n: 'baby', kw: ['infant', 'newborn'] },
      { e: '🧒', n: 'child', kw: ['kid'] },
      { e: '👨‍👩‍👧‍👦', n: 'family', kw: ['everyone', 'household'] },
      { e: '🎓', n: 'graduation cap', kw: ['school', 'college', 'graduate'] },
      { e: '🧑‍🏫', n: 'teacher', kw: ['school', 'class', 'conference'] },
      { e: '🧑‍⚕️', n: 'doctor', kw: ['nurse', 'appointment', 'clinic'] },
      { e: '🧑‍🍳', n: 'cook', kw: ['chef', 'kitchen', 'dinner'] },
      { e: '🧑‍💻', n: 'person at computer', kw: ['work', 'remote', 'office'] },
      { e: '👮', n: 'police officer', kw: ['safety'] },
      { e: '🧑‍🚒', n: 'firefighter', kw: ['fire drill'] },
      { e: '🤶', n: 'mrs claus', kw: ['christmas', 'holiday'] },
      { e: '🎅', n: 'santa', kw: ['christmas', 'holiday'] },
    ],
  },
  {
    id: 'activities',
    icons: [
      { e: '⚽', n: 'soccer ball', kw: ['football', 'practice', 'game'] },
      { e: '🏀', n: 'basketball', kw: ['hoops', 'practice', 'game'] },
      { e: '🏈', n: 'american football', kw: ['practice', 'game'] },
      { e: '⚾', n: 'baseball', kw: ['practice', 'game', 'little league'] },
      { e: '🥎', n: 'softball', kw: ['practice', 'game'] },
      { e: '🎾', n: 'tennis', kw: ['practice', 'match'] },
      { e: '🏐', n: 'volleyball', kw: ['practice', 'game'] },
      { e: '🏒', n: 'hockey', kw: ['ice', 'practice', 'game'] },
      { e: '🥍', n: 'lacrosse', kw: ['practice', 'game'] },
      { e: '🏓', n: 'table tennis', kw: ['ping pong'] },
      { e: '🏸', n: 'badminton', kw: ['shuttlecock'] },
      { e: '⛳', n: 'golf', kw: ['course', 'tee time'] },
      { e: '🥋', n: 'martial arts', kw: ['karate', 'judo', 'taekwondo'] },
      { e: '🤸', n: 'gymnastics', kw: ['tumbling', 'cartwheel'] },
      { e: '🏊', n: 'swimming', kw: ['pool', 'swim lesson'] },
      { e: '🚴', n: 'cycling', kw: ['bike ride'] },
      { e: '🏃', n: 'running', kw: ['track', 'cross country', 'jog'] },
      { e: '🥾', n: 'hiking boot', kw: ['hike', 'trail'] },
      { e: '⛸️', n: 'ice skating', kw: ['skate', 'rink'] },
      { e: '🎿', n: 'skiing', kw: ['slopes', 'winter'] },
      { e: '🛷', n: 'sledding', kw: ['snow', 'winter'] },
      { e: '🎣', n: 'fishing', kw: ['lake'] },
      { e: '🏕️', n: 'camping', kw: ['tent', 'outdoors'] },
      { e: '🎸', n: 'guitar', kw: ['lesson', 'band', 'music'] },
      { e: '🎹', n: 'piano', kw: ['keyboard', 'lesson', 'recital'] },
      { e: '🥁', n: 'drums', kw: ['lesson', 'band', 'percussion'] },
      { e: '🎻', n: 'violin', kw: ['orchestra', 'strings', 'lesson'] },
      { e: '🎤', n: 'microphone', kw: ['singing', 'choir', 'karaoke'] },
      { e: '🎨', n: 'art', kw: ['paint', 'class', 'craft'] },
      { e: '🎭', n: 'theater', kw: ['drama', 'play', 'rehearsal'] },
      { e: '🎬', n: 'movie', kw: ['film', 'cinema'] },
      { e: '🎮', n: 'video game', kw: ['gaming', 'screen time'] },
      { e: '♟️', n: 'chess', kw: ['club', 'tournament'] },
      { e: '🎳', n: 'bowling', kw: ['league', 'alley'] },
      { e: '🧩', n: 'puzzle', kw: ['jigsaw', 'game'] },
      { e: '📚', n: 'books', kw: ['reading', 'library', 'homework', 'study'] },
    ],
  },
  {
    id: 'food',
    icons: [
      { e: '🍳', n: 'cooking egg', kw: ['breakfast', 'fry'] },
      { e: '🥞', n: 'pancakes', kw: ['breakfast'] },
      { e: '🥣', n: 'cereal', kw: ['breakfast', 'oatmeal', 'bowl'] },
      { e: '🥗', n: 'salad', kw: ['greens', 'healthy', 'lunch'] },
      { e: '🥪', n: 'sandwich', kw: ['lunch'] },
      { e: '🌮', n: 'taco', kw: ['mexican', 'dinner'] },
      { e: '🌯', n: 'burrito', kw: ['wrap', 'mexican'] },
      { e: '🍕', n: 'pizza', kw: ['dinner', 'friday'] },
      { e: '🍔', n: 'burger', kw: ['hamburger', 'grill'] },
      { e: '🌭', n: 'hot dog', kw: ['grill', 'cookout'] },
      { e: '🍝', n: 'pasta', kw: ['spaghetti', 'noodles', 'italian'] },
      { e: '🍜', n: 'noodles', kw: ['ramen', 'soup'] },
      { e: '🍲', n: 'stew', kw: ['soup', 'crockpot', 'slow cooker'] },
      { e: '🍛', n: 'curry', kw: ['rice', 'dinner'] },
      { e: '🍣', n: 'sushi', kw: ['japanese'] },
      { e: '🥩', n: 'steak', kw: ['meat', 'beef', 'grill'] },
      { e: '🍗', n: 'chicken', kw: ['poultry', 'drumstick'] },
      { e: '🐟', n: 'fish', kw: ['seafood'] },
      { e: '🥦', n: 'broccoli', kw: ['vegetable', 'greens'] },
      { e: '🥕', n: 'carrot', kw: ['vegetable'] },
      { e: '🍎', n: 'apple', kw: ['fruit', 'snack'] },
      { e: '🍌', n: 'banana', kw: ['fruit', 'snack'] },
      { e: '🍓', n: 'strawberry', kw: ['fruit'] },
      { e: '🍞', n: 'bread', kw: ['loaf', 'bakery'] },
      { e: '🧀', n: 'cheese', kw: ['dairy'] },
      { e: '🎂', n: 'birthday cake', kw: ['party', 'celebrate'] },
      { e: '🧁', n: 'cupcake', kw: ['treat', 'bake sale'] },
      { e: '🍪', n: 'cookie', kw: ['treat', 'bake sale', 'snack'] },
      { e: '🍩', n: 'donut', kw: ['treat', 'breakfast'] },
      { e: '🍦', n: 'ice cream', kw: ['dessert', 'treat'] },
      { e: '🍿', n: 'popcorn', kw: ['movie night', 'snack'] },
      { e: '☕', n: 'coffee', kw: ['cafe', 'morning'] },
      { e: '🍵', n: 'tea', kw: ['drink'] },
      { e: '🥤', n: 'soda', kw: ['drink', 'cup'] },
      { e: '🥛', n: 'milk', kw: ['dairy', 'drink'] },
      { e: '🍷', n: 'wine', kw: ['drink', 'date night'] },
      { e: '🍺', n: 'beer', kw: ['drink'] },
      { e: '🎃', n: 'pumpkin', kw: ['halloween', 'fall', 'autumn'] },
    ],
  },
  {
    id: 'nature',
    icons: [
      { e: '☀️', n: 'sun', kw: ['sunny', 'clear', 'hot'] },
      { e: '🌙', n: 'moon', kw: ['night', 'evening', 'bedtime'] },
      { e: '⛅', n: 'partly cloudy', kw: ['clouds', 'weather'] },
      { e: '☁️', n: 'cloud', kw: ['cloudy', 'overcast'] },
      { e: '🌧️', n: 'rain', kw: ['rainy', 'wet', 'shower'] },
      { e: '⛈️', n: 'thunderstorm', kw: ['lightning'] },
      { e: '❄️', n: 'snowflake', kw: ['cold', 'winter'] },
      { e: '☃️', n: 'snowman', kw: ['winter'] },
      { e: '🌪️', n: 'tornado', kw: ['storm', 'severe weather'] },
      { e: '🌈', n: 'rainbow', kw: ['colorful'] },
      { e: '💧', n: 'water drop', kw: ['rain', 'hydrate'] },
      { e: '🌡️', n: 'thermometer', kw: ['temperature', 'fever', 'hot', 'cold'] },
      { e: '🌿', n: 'herb', kw: ['plant', 'green', 'garden'] },
      { e: '🌸', n: 'blossom', kw: ['flower', 'spring'] },
      { e: '🌻', n: 'sunflower', kw: ['summer'] },
      { e: '🌳', n: 'tree', kw: ['park', 'outdoors'] },
      { e: '🍁', n: 'maple leaf', kw: ['fall', 'autumn'] },
      { e: '🌱', n: 'seedling', kw: ['plant', 'garden', 'grow'] },
      { e: '🐶', n: 'dog', kw: ['puppy', 'pet', 'walk', 'vet'] },
      { e: '🐱', n: 'cat', kw: ['kitten', 'pet', 'vet'] },
      { e: '🐰', n: 'rabbit', kw: ['bunny', 'pet', 'easter'] },
      { e: '🐹', n: 'hamster', kw: ['pet'] },
      { e: '🐦', n: 'bird', kw: ['pet'] },
      { e: '🐴', n: 'horse', kw: ['riding', 'lesson', 'stable'] },
      { e: '🐾', n: 'paw prints', kw: ['pet', 'animal', 'vet'] },
    ],
  },
  {
    id: 'places',
    icons: [
      { e: '✈️', n: 'airplane', kw: ['flight', 'trip', 'vacation', 'travel'] },
      { e: '🚗', n: 'car', kw: ['drive', 'ride', 'carpool'] },
      { e: '🚌', n: 'bus', kw: ['school bus', 'ride'] },
      { e: '🚂', n: 'train', kw: ['rail', 'travel'] },
      { e: '🚲', n: 'bicycle', kw: ['bike', 'ride'] },
      { e: '🛴', n: 'scooter', kw: ['ride'] },
      { e: '⛵', n: 'sailboat', kw: ['lake', 'sailing'] },
      { e: '🚕', n: 'taxi', kw: ['cab', 'rideshare'] },
      { e: '⛽', n: 'gas station', kw: ['fuel', 'fill up'] },
      { e: '🏫', n: 'school', kw: ['class', 'campus'] },
      { e: '🏥', n: 'hospital', kw: ['clinic', 'doctor', 'appointment'] },
      { e: '🏛️', n: 'civic building', kw: ['museum', 'library', 'court'] },
      { e: '⛪', n: 'church', kw: ['worship', 'service', 'sunday'] },
      { e: '🏢', n: 'office building', kw: ['work'] },
      { e: '🏪', n: 'store', kw: ['shop', 'errands'] },
      { e: '🏖️', n: 'beach', kw: ['vacation', 'summer'] },
      { e: '🏔️', n: 'mountain', kw: ['hike', 'ski', 'trip'] },
      { e: '🏞️', n: 'park', kw: ['outdoors', 'nature', 'trail'] },
      { e: '🎡', n: 'fair', kw: ['carnival', 'ferris wheel', 'festival'] },
      { e: '🗺️', n: 'map', kw: ['directions', 'trip'] },
      { e: '📍', n: 'location pin', kw: ['place', 'address', 'where'] },
      { e: '🧳', n: 'luggage', kw: ['packing', 'trip', 'travel'] },
    ],
  },
  {
    id: 'things',
    icons: [
      { e: '✏️', n: 'pencil', kw: ['write', 'homework', 'school'] },
      { e: '📝', n: 'notes', kw: ['memo', 'write', 'test'] },
      { e: '📖', n: 'open book', kw: ['reading', 'study'] },
      { e: '🎒', n: 'backpack', kw: ['school', 'bag'] },
      { e: '💻', n: 'laptop', kw: ['computer', 'work', 'screen'] },
      { e: '📱', n: 'phone', kw: ['mobile', 'call', 'screen'] },
      { e: '📷', n: 'camera', kw: ['photo', 'picture', 'pictures'] },
      { e: '🔑', n: 'key', kw: ['unlock', 'house'] },
      { e: '🧹', n: 'broom', kw: ['sweep', 'clean', 'chore'] },
      { e: '🧺', n: 'laundry basket', kw: ['washing', 'clothes', 'chore'] },
      { e: '🗑️', n: 'trash can', kw: ['garbage', 'bin', 'take out'] },
      { e: '♻️', n: 'recycling', kw: ['recycle', 'bin', 'green'] },
      { e: '🧼', n: 'soap', kw: ['wash', 'clean', 'chore'] },
      { e: '🪥', n: 'toothbrush', kw: ['brush teeth', 'routine'] },
      { e: '🛁', n: 'bath', kw: ['shower', 'bathtime', 'routine'] },
      { e: '🛏️', n: 'bed', kw: ['bedtime', 'sleep', 'make the bed'] },
      { e: '🔧', n: 'wrench', kw: ['fix', 'repair', 'maintenance'] },
      { e: '🔨', n: 'hammer', kw: ['build', 'project', 'repair'] },
      { e: '💊', n: 'pill', kw: ['medicine', 'vitamin', 'meds'] },
      { e: '💉', n: 'shot', kw: ['vaccine', 'immunization', 'flu shot'] },
      { e: '🩺', n: 'stethoscope', kw: ['doctor', 'checkup', 'appointment'] },
      { e: '🦷', n: 'tooth', kw: ['dentist', 'cleaning', 'orthodontist'] },
      { e: '👓', n: 'glasses', kw: ['eye doctor', 'optometrist', 'vision'] },
      { e: '💰', n: 'money bag', kw: ['allowance', 'savings', 'pay'] },
      { e: '💳', n: 'credit card', kw: ['payment', 'bill', 'due'] },
      { e: '🎁', n: 'gift', kw: ['present', 'birthday'] },
      { e: '🛒', n: 'shopping cart', kw: ['groceries', 'store', 'errands'] },
      { e: '📦', n: 'package', kw: ['delivery', 'shipping', 'mail'] },
      { e: '📬', n: 'mailbox', kw: ['post'] },
      { e: '🔔', n: 'bell', kw: ['reminder', 'alert', 'notification'] },
      { e: '🏆', n: 'trophy', kw: ['win', 'award', 'tournament'] },
      { e: '🥇', n: 'first place medal', kw: ['gold', 'win', 'award'] },
      { e: '🎟️', n: 'ticket', kw: ['event', 'admission', 'show'] },
      { e: '🕯️', n: 'candle', kw: ['memorial', 'quiet'] },
    ],
  },
  {
    id: 'celebrations',
    icons: [
      { e: '🎈', n: 'balloon', kw: ['party', 'birthday'] },
      { e: '🎀', n: 'ribbon', kw: ['bow', 'gift'] },
      { e: '🎊', n: 'confetti', kw: ['celebrate', 'party'] },
      { e: '🥂', n: 'toast', kw: ['celebrate', 'anniversary', 'new year'] },
      { e: '💍', n: 'ring', kw: ['wedding', 'engagement', 'anniversary'] },
      { e: '💒', n: 'wedding', kw: ['marriage', 'ceremony'] },
      { e: '🎄', n: 'christmas tree', kw: ['holiday'] },
      { e: '🕎', n: 'menorah', kw: ['hanukkah', 'holiday'] },
      { e: '🎆', n: 'fireworks', kw: ['fourth of july', 'new year', 'celebrate'] },
      { e: '👻', n: 'ghost', kw: ['halloween', 'spooky'] },
      { e: '🦃', n: 'turkey', kw: ['thanksgiving', 'holiday'] },
      { e: '🐣', n: 'chick', kw: ['easter', 'spring'] },
      { e: '💐', n: 'bouquet', kw: ['flowers', 'mothers day', 'anniversary'] },
      { e: '🇺🇸', n: 'us flag', kw: ['holiday', 'patriotic', 'fourth of july'] },
    ],
  },
  {
    id: 'symbols',
    icons: [
      { e: '🔴', n: 'red circle', kw: ['dot', 'stop', 'busy'] },
      { e: '🟠', n: 'orange circle', kw: ['dot'] },
      { e: '🟡', n: 'yellow circle', kw: ['dot', 'caution'] },
      { e: '🟢', n: 'green circle', kw: ['dot', 'go', 'free'] },
      { e: '🔵', n: 'blue circle', kw: ['dot'] },
      { e: '🟣', n: 'purple circle', kw: ['dot'] },
      { e: '⚫', n: 'black circle', kw: ['dot'] },
      { e: '⬜', n: 'white square', kw: ['blank', 'box'] },
      { e: '✔️', n: 'check', kw: ['done', 'yes', 'tick'] },
      { e: '✖️', n: 'cross mark', kw: ['no', 'cancel', 'wrong'] },
      { e: '➕', n: 'plus', kw: ['add', 'more'] },
      { e: '➖', n: 'minus', kw: ['subtract', 'less'] },
      { e: '➡️', n: 'arrow right', kw: ['next', 'forward'] },
      { e: '⬅️', n: 'arrow left', kw: ['back', 'previous'] },
      { e: '🔁', n: 'repeat', kw: ['recurring', 'every week', 'loop'] },
      { e: '🔒', n: 'lock', kw: ['private', 'closed'] },
      { e: '📶', n: 'signal', kw: ['wifi', 'bars'] },
      { e: '🔋', n: 'battery', kw: ['charge', 'power'] },
      { e: '♿', n: 'accessible', kw: ['wheelchair'] },
      { e: '🅿️', n: 'parking', kw: ['lot'] },
    ],
  },
];

/** Flat list in group order — the picker's default, unsearched ordering. */
export const ALL_EMOJI: readonly EmojiEntry[] = EMOJI_GROUPS.flatMap((g) => g.icons);

/**
 * Name/alias search across every group. Exact-name matches sort first, then
 * name prefixes, then anything else, so typing "cake" puts 🎂 ahead of the
 * cupcake that merely lists "bake sale".
 */
export function searchEmoji(query: string): readonly EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_EMOJI;
  const scored: { entry: EmojiEntry; score: number }[] = [];
  for (const entry of ALL_EMOJI) {
    const name = entry.n.toLowerCase();
    let score: number;
    if (entry.e === query.trim()) score = 0;
    else if (name === q) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (entry.kw?.some((k) => k.toLowerCase().includes(q))) score = 4;
    else continue;
    scored.push({ entry, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.entry);
}

/** Catalog lookup for a stored glyph, used to label a picker trigger. */
export function findEmoji(glyph: string): EmojiEntry | undefined {
  return ALL_EMOJI.find((e) => e.e === glyph);
}
