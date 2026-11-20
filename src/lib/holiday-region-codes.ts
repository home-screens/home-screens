/**
 * The codes the school holiday lookup understands, in one place with no
 * imports: the lookup itself, the timetable save and the editor's region
 * picker must agree on them, and the editor cannot import either server
 * file. None carries a `g` flag, so sharing one object is safe.
 */

/** A country on its own: "DE", "NL". */
export const HOLIDAY_COUNTRY_CODE = /^[A-Z]{2}$/;

/** A country with a subdivision: "DE-NW". */
export const HOLIDAY_SUBDIVISION_CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

/**
 * Either shape. A country on its own is for the countries that publish one
 * set of dates and no regions. Anything else could never answer, so it is
 * refused when saved and never looked up while half typed.
 */
export const HOLIDAY_REGION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;
