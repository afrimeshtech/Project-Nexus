/**
 * Whether AfriMesh Circular - the circular-economy materials network (spec:
 * "AfriMesh Circular", Technical Architecture and Implementation
 * Specification) - is live.
 *
 * It ships dark. What is built: the circular_* tables, linked to the
 * existing business, user, payment and delivery records and seeded with the
 * specification's material taxonomy; the listing, enquiry and transaction
 * state machines; the weighted geospatial matching engine; and the Phase 1
 * service for business capabilities, listings and atomic quantity
 * reservation. What is switched off is every way in: /api/v1/circular answers
 * 501 and no screen links to it.
 *
 * Unlike ProductDNA, Circular is not a separate domain: the specification
 * makes it a native Commerce module that reuses identity, businesses,
 * geospatial search, AfriMesh Pay and AfriMesh Logistics (§1, §16).
 *
 * FUTURE-CIRCULAR: set to true to open the API and the screens.
 * `grep -rn FUTURE-CIRCULAR src` lists every switch that moves with it, and
 * docs/circular.md maps each specification phase to the files it touches.
 */
export const CIRCULAR_LAUNCHED: boolean = false
