import { describe, it, expect } from 'vitest';
import { sumGroceryAmounts } from '@/lib/grocery-amounts';

describe('sumGroceryAmounts', () => {
  it('adds up amounts in the same unit', () => {
    expect(sumGroceryAmounts(['2 lb', '2 lb', '1 lb'])).toBe('5 lb');
    expect(sumGroceryAmounts(['8 oz', '6 oz'])).toBe('14 oz');
  });

  it('adds up bare counts', () => {
    expect(sumGroceryAmounts(['2', '4', '12'])).toBe('18');
  });

  it('reads singular and plural as one unit, and says the total in the plural', () => {
    expect(sumGroceryAmounts(['1 can', '2 cans'])).toBe('3 cans');
    expect(sumGroceryAmounts(['1 head', '2 heads'])).toBe('3 heads');
    expect(sumGroceryAmounts(['1 bunch', '1 bunches'])).toBe('2 bunches');
  });

  it('puts a total in the plural when every meal asked for one', () => {
    expect(sumGroceryAmounts(['1 loaf', '1 loaf'])).toBe('2 loaves');
    expect(sumGroceryAmounts(['1 can', '1 can'])).toBe('2 cans');
    expect(sumGroceryAmounts(['1 Dose', '1 Dose'])).toBe('2 Dosen');
    expect(sumGroceryAmounts(['1 Glas', '2 Gläser'])).toBe('3 Gläser');
  });

  it('keeps a unit it has no plural for as typed', () => {
    expect(sumGroceryAmounts(['1 lb', '1 lb'])).toBe('2 lb');
    expect(sumGroceryAmounts(['1 Stück', '1 Stück'])).toBe('2 Stück');
  });

  it('adds simple fractions exactly', () => {
    expect(sumGroceryAmounts(['1/2 cup', '1/4 cup'])).toBe('3/4 cup');
    expect(sumGroceryAmounts(['1/3 cup', '2/3 cup'])).toBe('1 cup');
    expect(sumGroceryAmounts(['1 1/2 cups', '1/2 cup'])).toBe('2 cups');
    expect(sumGroceryAmounts(['1 cup', '1/2 cup'])).toBe('1 1/2 cups');
  });

  it('reads fraction characters', () => {
    expect(sumGroceryAmounts(['½ cup', '½ cup'])).toBe('1 cup');
    expect(sumGroceryAmounts(['1½ cups', '¼ cup'])).toBe('1 3/4 cups');
  });

  it('adds decimals, with the decimal mark the family used', () => {
    expect(sumGroceryAmounts(['1.5 kg', '0.25 kg'])).toBe('1.75 kg');
    expect(sumGroceryAmounts(['1,5 kg', '1 kg'])).toBe('2,5 kg');
  });

  it('keeps different units apart and never converts them', () => {
    expect(sumGroceryAmounts(['1 lb', '8 oz', '1 lb'])).toBe('2 lb, 8 oz');
    expect(sumGroceryAmounts(['1 l', '2 cups'])).toBe('1 l, 2 cups');
    expect(sumGroceryAmounts(['2', '2 cups'])).toBe('2, 2 cups');
  });

  it('keeps text it cannot add as typed, joined in the order it came', () => {
    expect(sumGroceryAmounts(['a pinch', '1 tsp', 'to taste', '1 tsp'])).toBe('a pinch, 2 tsp, to taste');
    expect(sumGroceryAmounts(['2-3 cloves', '2 cloves'])).toBe('2-3 cloves, 2 cloves');
    expect(sumGroceryAmounts(['2 to 3 cups', '1 cup'])).toBe('2 to 3 cups, 1 cup');
    expect(sumGroceryAmounts(['1 (15 oz) can', '1 (15 oz) can'])).toBe('1 (15 oz) can, 1 (15 oz) can');
  });

  it('leaves a number whose separator could mean thousands as typed', () => {
    expect(sumGroceryAmounts(['1,500 g', '1,500 g'])).toBe('1,500 g, 1,500 g');
  });

  it('shows a lone amount exactly as it was typed', () => {
    expect(sumGroceryAmounts(['1½ cups'])).toBe('1½ cups');
    expect(sumGroceryAmounts(['15oz'])).toBe('15oz');
    expect(sumGroceryAmounts(['2 lb', '1½ cups'])).toBe('2 lb, 1½ cups');
  });

  it('leaves out empty amounts', () => {
    expect(sumGroceryAmounts(['', '2 lb', '  ', '1 lb'])).toBe('3 lb');
    expect(sumGroceryAmounts(['', ''])).toBe('');
  });

  it('does not take a short abbreviation for the start of a longer unit', () => {
    expect(sumGroceryAmounts(['1 l', '1 lb'])).toBe('1 l, 1 lb');
    expect(sumGroceryAmounts(['100 g', '1 gal'])).toBe('100 g, 1 gal');
  });
});
