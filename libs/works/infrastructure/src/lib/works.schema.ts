/**
 * The works catalog's TypeDBLite schema (ADR-003).
 *
 * 🔴 **A `work` is only an identity: its key and its place in the catalog.** Everything about it that
 * changes lives in a replaceable `work-details` entity, because the engine cannot change an
 * attribute in place, only delete and re-insert the entity that owns it. Replacing `work` itself
 * would sever every relation that points at it, including the manuscript's. Editions are likewise
 * replaced whole. Every attribute is always written (an empty string when there is no value),
 * because an attribute written only sometimes makes a `match` silently drop the rows without it.
 */
export const WORKS_SCHEMA = `define

attribute work-id, value string;
attribute work-order, value integer;
entity work,
    owns work-id @key,
    owns work-order,
    plays work-details-of:owner,
    plays work-edition:owner;

attribute work-details-key, value string;
attribute work-title, value string;
attribute work-subtitle, value string;
attribute work-synopsis, value string;
attribute work-status, value string;
attribute work-created-at, value string;
attribute work-updated-at, value string;
entity work-details,
    owns work-details-key @key,
    owns work-title,
    owns work-subtitle,
    owns work-synopsis,
    owns work-status,
    owns work-created-at,
    owns work-updated-at,
    plays work-details-of:details;

relation work-details-of,
    relates owner,
    relates details;

attribute edition-key, value string;
attribute edition-work, value string;
attribute edition-number, value integer;
attribute edition-label, value string;
attribute edition-status, value string;
attribute edition-published-on, value string;
attribute edition-notes, value string;
attribute edition-created-at, value string;
attribute edition-updated-at, value string;
entity edition,
    owns edition-key @key,
    owns edition-work,
    owns edition-number,
    owns edition-label,
    owns edition-status,
    owns edition-published-on,
    owns edition-notes,
    owns edition-created-at,
    owns edition-updated-at,
    plays work-edition:edition;

relation work-edition,
    relates owner,
    relates edition;
`;
