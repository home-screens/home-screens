import type { FamilyMember } from './family';

export interface FamilyMealRating {
  mealId: string;
  memberId: string;
  rating: number;
  updatedAt: string;
}

export interface MealRatingsAnswer {
  ratings: FamilyMealRating[];
  members: FamilyMember[];
}
