/** One person's stars for one recipe: a saved meal's id, or a Mealie recipe's (`mealie:<id>`). */
export interface FamilyMealRating {
  mealId: string;
  memberId: string;
  /** 1 to 5. */
  rating: number;
  updatedAt: string;
}
