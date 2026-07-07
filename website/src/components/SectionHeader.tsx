import type { ReactNode } from 'react';

const DEFAULT_DESCRIPTION_CLASS = 'mt-3 max-w-2xl text-neutral-400';

/**
 * Shared marketing section header: optional eyebrow, an `h2` title, and a
 * description paragraph. Returns a fragment so callers keep their own wrapper
 * (margin, alignment) and control the description classes when they differ
 * from the common `mt-3 max-w-2xl` default.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  descriptionClassName = DEFAULT_DESCRIPTION_CLASS,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  descriptionClassName?: string;
}) {
  return (
    <>
      {eyebrow}
      <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className={descriptionClassName}>{description}</p>
    </>
  );
}
