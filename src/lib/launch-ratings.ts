/**
 * Whether buyers rate sellers.
 *
 * The MVP leaves rating out: a shopper is not asked to rate a seller after an
 * order, and a rating cannot be submitted. The rating form, the action and the
 * schema are all still built; what is switched off is the way in.
 *
 * FUTURE-RATINGS: set to true to let buyers rate sellers again.
 * `grep -rn FUTURE-RATINGS src` lists every switch that moves with it.
 */
export const RATINGS_LAUNCHED: boolean = false
