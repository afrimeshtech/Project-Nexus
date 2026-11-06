/**
 * Whether ProductDNA - product identity, lifecycle and counterfeit-risk
 * verification (spec AFRI-PDNA-TIS-001) - is live.
 *
 * It ships dark. What is built: the `productdna` database schema with every
 * table, constraint and index the specification defines; the identity and
 * commercial lifecycle state machines; the counterfeit-risk classifier and the
 * privacy-safe public verification response; the Commerce Integration Gateway
 * that reads confirmed commerce events from the event log; and the Phase 1
 * manufacturer and product identity registry. What is switched off is every
 * way in: the gateway does not run, /api/v1/productdna answers 501, and no
 * screen links to it.
 *
 * FUTURE-PRODUCTDNA: set to true to start the gateway and open the API.
 * `grep -rn FUTURE-PRODUCTDNA src` lists every switch that moves with it, and
 * docs/productdna.md maps each specification phase to the files it touches.
 */
export const PRODUCTDNA_LAUNCHED: boolean = false
