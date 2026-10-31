'use client';

import type { CSSProperties } from 'react';
import type { ResolvedCourse } from '@/lib/meal-courses';
import { getMealCourseLabelKey } from '@/lib/meal-courses';
import { useLocale, useTranslate } from '@/i18n';

interface MealCourseLinesProps {
  courses: ResolvedCourse[];
  /** Font size of the "SIDE" label. */
  labelSize: string;
  /** Font size of the course's name. */
  nameSize: string;
  /** Space between the label column and the names. */
  gap: string;
  /** Space between lines; none by default, the line height spaces them. */
  rowGap?: string;
  /** Centred under a centred dish (Next meal, a hero): labels right-aligned to the names. */
  centered?: boolean;
  /** Label ink; the dim module ink unless a theme names its own. */
  labelStyle?: CSSProperties;
  /** Name ink, one step brighter than the label. */
  nameStyle?: CSSProperties;
  style?: CSSProperties;
}

/**
 * A meal's courses as lines under its dish: the label first in small
 * capitals ("SIDE  Griddled flatbreads"), dim, with the name one step
 * brighter, so the dish name stays the loudest thing in the card. The labels
 * sit in a column so the names line up. Text only: only the main dish gets a
 * picture.
 */
export function MealCourseLines({ courses, labelSize, nameSize, gap, rowGap, centered, labelStyle, nameStyle, style }: MealCourseLinesProps) {
  const t = useTranslate('modules');
  if (courses.length === 0) return null;
  return (
    <div
      data-meal-courses
      style={{
        display: 'grid',
        gridTemplateColumns: centered ? 'auto auto' : 'auto minmax(0, 1fr)',
        columnGap: gap,
        rowGap,
        alignItems: 'baseline',
        justifyContent: centered ? 'center' : undefined,
        maxWidth: '100%',
        ...style,
      }}
    >
      {courses.map((course, i) => (
        <CourseLine key={i} course={course} label={t(getMealCourseLabelKey(course.kind))} {...{ labelSize, nameSize, centered, labelStyle, nameStyle }} />
      ))}
    </div>
  );
}

function CourseLine({ course, label, labelSize, nameSize, centered, labelStyle, nameStyle }: {
  course: ResolvedCourse;
  label: string;
  labelSize: string;
  nameSize: string;
  centered?: boolean;
  labelStyle?: CSSProperties;
  nameStyle?: CSSProperties;
}) {
  return (
    <>
      <span
        style={{
          fontSize: labelSize,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          whiteSpace: 'nowrap',
          opacity: labelStyle?.color ? undefined : 0.45,
          justifySelf: centered ? 'end' : undefined,
          ...labelStyle,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: nameSize,
          lineHeight: 1.45,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
          opacity: nameStyle?.color ? undefined : 0.8,
          justifySelf: centered ? 'start' : undefined,
          textAlign: 'left',
          ...nameStyle,
        }}
      >
        {course.name}
      </span>
    </>
  );
}

/**
 * The "+3" a view with no room for course lines shows beside a dish: a small
 * pill in the slot's colour counting every course, another main included.
 */
export function MealCourseCount({ count, color, fontSize, padding = '0 0.42em', style }: {
  count: number;
  color: string;
  fontSize: string;
  padding?: string;
  style?: CSSProperties;
}) {
  if (count <= 0) return null;
  return (
    <span
      data-meal-course-count
      style={{
        display: 'inline-block',
        fontWeight: 600,
        borderRadius: 999,
        lineHeight: 1.45,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontSize,
        color,
        backgroundColor: `${color}24`,
        padding,
        ...style,
      }}
    >
      +{count}
    </span>
  );
}

/**
 * "with Egg rolls, Timbits and Lemonade": a dish's courses named on one line
 * under it, for the views with room to say what comes with a meal instead of
 * counting it (the full-screen Week, the List view). The tight Week grid and
 * Compact keep `MealCourseCount`.
 */
export function MealCourseNames({ courses, style }: { courses: ResolvedCourse[]; style?: CSSProperties }) {
  const t = useTranslate('modules');
  const locale = useLocale();
  if (courses.length === 0) return null;
  const dishes = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(courses.map((c) => c.name));
  return (
    <span data-meal-course-names style={style}>
      {t('meal-planner.withCourses', { dishes })}
    </span>
  );
}
