'use client';

import { useEffect, useRef, useState } from 'react';
import { useHouseholdToday } from '../household-clock';

/**
 * Which day the chores are shown for, and what today is.
 *
 * Today is the hub's calendar day once it has said so: a phone with a wrong
 * clock (or near midnight) must not show or tick a different day than the
 * wall and the other phones. The household clock, rolling over at midnight
 * in the household's zone rather than the phone's, covers a hub that cannot
 * be reached. When today moves on, someone parked on what used to be today
 * is walked forward; someone looking at an earlier day is left there.
 */
export function useHouseholdDayRollover({ initialDate, hubToday }: {
  /** The day the page was drawn for, as `YYYY-MM-DD`. */
  initialDate: string;
  /** The hub's day from its last answer, null until it has answered. */
  hubToday: string | null;
}) {
  const householdDay = useHouseholdToday();
  const realToday = hubToday ?? householdDay;
  const [viewingDate, setViewingDate] = useState(initialDate);
  const shownToday = useRef(realToday);
  useEffect(() => {
    const before = shownToday.current;
    if (before === realToday) return;
    shownToday.current = realToday;
    setViewingDate((prev) => (prev === before ? realToday : prev));
  }, [realToday]);
  return { realToday, viewingDate, setViewingDate, isViewingPast: viewingDate !== realToday };
}
