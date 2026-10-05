/**
 * Whether the recommendation engine orders what buyers see.
 *
 * The MVP does not rank shops. Results are listed nearest first, and nothing
 * on screen scores, numbers or badges one shop above another. The engine -
 * the weighted score, its breakdown, the admin weights console - is all still
 * built and still computed; what is switched off is its say in the order and
 * every place that shows it.
 *
 * FUTURE-RANKING: set to true to rank again.
 * `grep -rn FUTURE-RANKING src` lists every switch that moves with it.
 */
export const RANKING_LAUNCHED: boolean = false
