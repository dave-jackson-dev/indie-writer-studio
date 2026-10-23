/**
 * The manuscript's TypeDBLite schema (ADR-003). It extends the works catalog's `work` entity, so it
 * is defined after `WORKS_SCHEMA` in the same database: a node belongs to a Work by relation, and a
 * Work that does not exist cannot be related to.
 *
 * 🔴 A node is replaced whole when it changes (the engine cannot change an attribute in place), so
 * nothing relates *to* a node except its Work. Its parent and its position among its siblings are
 * attributes, and the tree is put back together from them; `node-parent` is an empty string at the
 * top level of a matter, because an attribute written only sometimes makes a `match` silently drop
 * the rows without it.
 */
export const MANUSCRIPT_SCHEMA = `define

attribute node-id, value string;
attribute node-work, value string;
attribute node-kind, value string;
attribute node-title, value string;
attribute node-body, value string;
attribute node-matter, value string;
attribute node-parent, value string;
attribute node-position, value integer;
entity manuscript-node,
    owns node-id @key,
    owns node-work,
    owns node-kind,
    owns node-title,
    owns node-body,
    owns node-matter,
    owns node-parent,
    owns node-position,
    plays manuscript-of:node;

relation manuscript-of,
    relates work,
    relates node;

work plays manuscript-of:work;
`;
