import { VariableNode, FieldNode } from "graphql/language/ast"

// ast related helpers, don't think they are in the core graphql libs

export function hasAlias(node: FieldNode): boolean {
  return !!node.alias
}

/** Give a FieldNode, defined in selection set, return its alias or its name. */
export function aliasOrName(f: FieldNode) {
  return f.alias?.value ?? f.name.value
}
