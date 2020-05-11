import { NormalizedScalarsMap, getBaseTypeNode, separateSelectionSet } from "@graphql-codegen/visitor-plugin-common"
import {
  GraphQLSchema,
  SelectionSetNode,
  GraphQLNamedType,
  getNamedType,
  GraphQLObjectType,
  FieldNode,
  GraphQLField,
  isObjectType,
  SelectionNode,
  FragmentSpreadNode,
  FragmentDefinitionNode,
  isLeafType,
  Kind,
  isScalarType,
} from "graphql"
import { debug_type } from "./types"
import { log } from "./logger"
import { createPLVariable, GenOptions, PLVariableInfo } from "./plvariable"
import { aliasOrName, hasAlias } from "./ast"

/** Resolve AST FieldNodes to ResolvedFields. Throws an error if the
 * field is not a field on the parent type.
 */
export function resolveFieldNodes(parent: GraphQLObjectType, fields: ReadonlyArray<FieldNode>) {
  const lookup = parent.getFields()
  return fields.map(f => {
    const type_name = f.name.value // use name not alias!
    const field_def = lookup[type_name]
    if (!field_def) throw new Error(`Could not find ${type_name} field on ${parent.name}`)
    return ResolvedField.fromField(parent, field_def, f)
  })
}

/** Resolve a list of SelectionNodes (defined in operations) against
 * a parent and the overall schema.
 *
 * @param convertSpreadsToFields true => spreads become fields inline, else assumed as a separate trait.
 */
export function resolveSelectionSet(
  context: ResolveContext,
  parentType: GraphQLObjectType,
  set: ReadonlyArray<SelectionNode>,
  convertSpreadsToFields: boolean = true
): ResolvedSelectionSet {
  const logme = log.extend("resolveSelectionSet")
  logme(`Resolving selection set on parent type ${parentType}. ${set.length} selection(s).`)
  // TODO: Process inline spreads here...
  const { fields, spreads, inlines } = separateSelectionSet(set)
  logme(`Inspecting fields: ${fields.length}, spreads: ${spreads.length}`)
  const resolved = resolveFieldNodes(parentType, fields)
  // convert spreads to fields which must be fields on this parent type
  const spread_fields: Array<ResolvedField> = convertSpreadsToFields
    ? spreads.flatMap(s => resolveFragmentSpreadToFields(context, parentType, s))
    : []
  logme(`Generated ${resolved.length} fields from fields: (${resolved.map(f => f.name)})`)
  logme(`Generated ${spread_fields.length} fields from spreads: (${spread_fields.map(f => f.name)}).`)
  return new ResolvedSelectionSet(context.schema, parentType, [...resolved, ...spread_fields], [])
}

/** Use fragment name on FragmentSpreadNode to create a list of resolved fields.
 * FragmentSpreadNodes are found in operation definitions and represent the use
 * of a spread vs the definition of a spread.
 *
 * @see resolveFragmentNameToFields
 */
export function resolveFragmentSpreadToFields(
  context: ResolveContext,
  parentType: GraphQLObjectType,
  spread: FragmentSpreadNode
): ReadonlyArray<ResolvedField> {
  const logme = log.extend("resolveFragmentSpreadToFields")
  const spread_name = spread.name.value
  const fields = resolveFragmentNameToFields(context, spread_name)
  logme(`Resolved spread ${spread_name} to ${fields.length} fields.`)
  if (fields[0].name !== parentType.name)
    throw new Error(`Resolved fragment named ${spread_name} appears to have a different type from ${parentType.name}`)
  return fields[1].map(
    f =>
      new ResolvedField(aliasOrName(f[0]), f[1], parentType, f[0].selectionSet?.selections ?? [], {
        comment: hasAlias(f[0]) ? `// alias for ${f[0].name.value}` : undefined,
      })
  )
}

/** Given the name of a fragment and the overall schema, expand
 * the fragment to a set of fields via the FragmentDefinition found in the context.
 * If any of the toplevel fragment
 * elements are fragments, expand those. Also return the corresponding FieldNode
 * which have additional information about aliases and directives.
 */
export function resolveFragmentNameToFields(
  context: ResolveContext,
  name: string
): [GraphQLNamedType, ReadonlyArray<[FieldNode, GraphQLField<any, any, {}>]>] {
  const logme = log.extend("resolveFragmentNameToFields")
  // find fragment definition
  const spread = context.fragmentByName(name)
  if (!spread) return null
  const ofTypeName = spread.typeCondition.name.value
  const ofType = context.schema.getType(ofTypeName)
  logme("ofType", ofType)
  logme("debug ofType")
  if (log.enabled) debug_type(ofType)

  const get_field = (fname: string) => (isObjectType(ofType) && ofType.getFields() ? ofType.getFields()[fname] : null)

  // process each field's AST
  const fields = spread.selectionSet.selections
    .map(sel => {
      switch (sel.kind) {
        case Kind.FIELD:
          // FieldNode
          const f = get_field(sel.name.value)
          return [[sel, f]]
          break
        case Kind.FRAGMENT_SPREAD:
          // fragment spread within the top level of this fragment spread
          // means it must be spread on the same type as the current lever's spread
          const r = resolveFragmentNameToFields(context, sel.name.value)
          if (!r) return null
          // check that parents match...
          const check_type_name = r[0].name
          if (check_type_name !== ofTypeName)
            throw new Error(
              `In fragment ${name}(${ofTypeName}) top-level fragment expansion had non-matching type: ${check_type_name}.`
            )
          return r[1]
          break
        case Kind.INLINE_FRAGMENT:
          throw new Error("resolveFragementSpreadAST: Kind.INLINE_FRAGMENT handling is unimplemented.")
          return null
          break
      }
    })
    .filter(a => a)
    .flat()
  return [ofType, fields]
}

/** Given a resolved field, resolve its selections. */
export function resolveFieldSelectionSet(context: ResolveContext, field: ResolvedField): ResolvedSelectionSet {
  const selectionSet = field.selectionSet
  // field could be named/list/not-null, recurse to get core type
  const core_type = getBaseTypeNode(field.field.astNode.type)
  const field_type = context.schema.getType(core_type.name.value)
  if (!isObjectType(field_type))
    throw new Error(`Resolved field '${field_type}.${field.name}' does not have selects to resolve.`)
  return resolveSelectionSet(context, field_type as GraphQLObjectType, selectionSet)
}

/** Resolve selection sets to a hierarchical, intermediate data structure
 * useful for different target languages and generate scala code. This
 * function is typically used at the highest level of definition
 * for an operation and the parentSchemaType is typically Query, Mutation
 * or Subscription. It is a wrapper over `resolveSelectionSet`.
 */
export function selectionSetToObject(
  context: ResolveContext,
  parentSchemaType: GraphQLNamedType,
  selectionSet: SelectionSetNode
) {
  return isObjectType(parentSchemaType) ? resolveSelectionSet(context, parentSchemaType, selectionSet.selections) : null
}

/** For all resolution processing, basic data that may be needed and what is or is not
 * in scope. Make this more robust as needed to handle target language scoping rules.
 */
export class ResolveContext {
  public constructor(
    public schema: GraphQLSchema,
    public fragments: ReadonlyArray<FragmentDefinitionNode>,
    public scalars: NormalizedScalarsMap
  ) {}
  /** Find a fragment by name. */
  fragmentByName = (name: string) => this.fragments.find(f => f.name.value === name)
}

/** Intermediate representation of resolved fields for a given
 * type. Sub-objects can be resolved by resolving the "complex"
 * fields. A selection set may resolve into a set of fields or
 * a set of inheritable traits or some combination of both.
 * The names of the supers shoud be FQN to be safe during code
 * generation.
 */
export class ResolvedSelectionSet {
  constructor(
    public schema: GraphQLSchema,
    public ofType: GraphQLObjectType,
    public fields: ReadonlyArray<ResolvedField>,
    public supers: ReadonlyArray<string>
  ) {
    if (!ofType) throw new Error(`Cannot create ResolvedSelectionSet with null ofType`)
  }

  get leaves() {
    return this.fields.filter(f => f.isLeaf)
  }

  get complex() {
    return this.fields.filter(f => f.isObject)
  }

  /** Partition the resolved fields into leaves and non-leaves. */
  get partition() {
    return [this.leaves, this.complex]
  }

  /** Resolve all object types and their selection sets. This resolves "sub-objects"
   * since scalars are the leaves.
   */
  resolveComplex = (context: ResolveContext): Array<[ResolvedField, ResolvedSelectionSet]> => {
    log("Resolving complex fields", this.fields.map(f => `${f.name} (${f.field.type})`).join(", "))
    return this.complex.map(f => [f, resolveFieldSelectionSet(context, f)])
  }
}

/** IR of a field selection from an object for use
 * in an operation such as a query or a mutation.
 */
export class ResolvedField {
  constructor(
    /** Name of field may be influenced by an alias so name may not always match `field.name`. */
    public name: string,
    /** Resolved field type. */
    public field: GraphQLField<any, any, {}>,
    /** Parent type. */
    public ofType: GraphQLObjectType,
    /** Subfields, if any, in AST format. They are not resolved. */
    public selectionSet: ReadonlyArray<SelectionNode>,
    /** Allow you to add some variable generation options. This probably breaks the abstraction a bit
     * so try not to use this as it may disappear.
     */
    public genOptions?: Partial<Pick<PLVariableInfo, "documentation" | "comment">>
  ) {
    if (log.enabled) {
      log(`Created ResolvedField ${name}`)
      debug_type(field.type)
    }
  }

  /**
   * @param ofType Parent type of field.
   * @param field Field definition from parent type.
   * @param astNode AST node of field definition where it was used
   */
  static fromField = (ofType: GraphQLObjectType, field: GraphQLField<any, any, {}>, astNode: FieldNode) => {
    return new ResolvedField(aliasOrName(astNode), field, ofType, astNode.selectionSet?.selections ?? [], {
      documentation: field.description ? field.description : undefined,
      comment: hasAlias(astNode) ? `Alias for ${astNode.name.value}` : undefined,
    })
  }

  get isLeaf() {
    return isLeafType(getNamedType(this.field.type))
  }

  get isScalar() {
    return isScalarType(getNamedType(this.field.type))
  }

  get isObject() {
    return isObjectType(getNamedType(this.field.type))
  }

  /** Return a PL variable from this object. */
  toPLVariable = (options?: GenOptions): PLVariableInfo => {
    return createPLVariable(this.name, this.field.type, { ...this.genOptions, ...options })
  }
}
