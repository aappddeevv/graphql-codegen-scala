import { GraphQLType, isNonNullType, isListType, isObjectType, isScalarType, getNamedType } from "graphql"
import { log } from "./logger"
import { mk_type_wrapper_thunk, WrapperOptions, defaultWrapperOptions } from "./types"
import { NormalizedScalarsMap, ParsedEnumValuesMap } from "@graphql-codegen/visitor-plugin-common"

/** A programming language type has a name and possible a path
 * that when put together is a QN. Rendering to a QN should be
 * a type class but there are none in typescript. The QN may be
 * qualified only up to its parent inclosing object (scope) versus
 * to a package root. Hence the name QN verus FQN. We really need
 * to create scope objects and formalize all of this messiness.
 */
export class PLType {
  constructor(public name: string, public path?: Array<string>) {}

  /** Renders to a `pathpart1.pathpart2.name` string. */
  public get dottedQN(): string {
    return (this.path ?? []).join(".") + this.name
  }

  /** Return a FQN. */
  public get qn(): string {
    return this.dottedQN
  }
}

/** IR of a programming language variable declaration.
 */
export interface PLVariableInfo {
  /** Varible name. */
  readonly name: string
  /** Original name from graphql schema. Only include this if the name was transformed. */
  readonly originalName?: string
  /** Base type without wrapping for null/optionality. May have
   * list wrapper though so it may not be the element type itself.
   */
  readonly type: PLType
  /** Call the wrapper to generate the full type signature. */
  readonly wrapper: (type: string) => string
  /** Default value, raw string. scala may need converters here. */
  readonly defaultValue?: string
  /** Documentation for this variable. */
  readonly documentation?: string
  /** Comment. Documentation is for documentation markup, but this is a comment near the declaration. */
  readonly comment?: string
  /** Whether this variable is mutable or not i.e. val vs var. Default is immutable. Default is true, */
  readonly immutable?: boolean
}

/** Create a PL variable from a name, type and options. Scalars and enums are searched on the bottom type
 * for a match and if matched, the type name is mapped.
 *
 * @param name Name from graphql.
 * @param type GraphQL type.
 * @param options Conversion options.
 * @todo Does not properly handle dotted path names but does initialize PLType correctly.
 */
export function createPLVariable(name: string, type: GraphQLType, options?: Partial<GenOptions>): PLVariableInfo {
  const opts: GenOptions = { ...defaultGenOptions, ...options }
  //debug_type(type);
  const named_type = getNamedType(type)
  const bottom_name = named_type.name
  let tname = null
  // quest to determine tname
  let scalar_converted = false
  let enum_converted = false
  if (isScalarType(named_type) && opts.scalars && opts.scalars[bottom_name]) {
    tname = opts.scalars[bottom_name]
    scalar_converted = true
  } else if (opts.enums && opts.enums[bottom_name]) {
    tname = opts.enums[bottom_name].typeIdentifier || opts.enums[bottom_name].sourceIdentifier
    enum_converted = true
  } else {
    tname = bottom_name
  }
  tname = `${isObjectType(named_type) && opts.objectsHaveParentType ? `${opts.objectsHaveParentType}.` : ""}${tname}`
  const domain =
    isObjectType(named_type) && opts.objectsHaveParentType ? [opts.objectsHaveParentType] : opts.path ? opts.path : []
  // should defaultValue get wrapper treatment???
  let defaultValue = opts.defaultValue
  if (!defaultValue && isListType(type)) defaultValue = opts.wrapperOptions.mkListZero(tname)
  else if (!defaultValue && !isNonNullType(type)) defaultValue = opts.wrapperOptions.mkOptZero(tname)
  const newName = opts.convertName ? opts.convertName(name) : name
  return {
    name: newName,
    originalName: newName !== name ? name : undefined,
    type: new PLType(tname, domain),
    wrapper: mk_type_wrapper_thunk(type, opts.wrapperOptions),
    defaultValue,
    comment: opts?.comment,
    documentation: opts?.documentation,
    immutable: opts.immutable,
  }
}

/** Options for generating a programming language variable. */
export type GenOptions = Partial<Pick<PLVariableInfo, "documentation" | "comment" | "defaultValue">> & {
  /** Object types have a path prefix given by this value. If present, overrides `path`. */
  objectsHaveParentType?: string
  /** Final scalar map to use if scalar type. */
  scalars?: NormalizedScalarsMap
  /** Final enums map. */
  enums?: ParsedEnumValuesMap
  /** Path to the type e.g. `package1.package2.typename` */
  path?: Array<string>
  /** Mutability of variable. */
  immutable?: boolean
  /** Options for `mk_type_wrapper_thunk`. */
  wrapperOptions?: Partial<WrapperOptions>
  /** Some type of default value. Very opaque. */
  defaultValue?: any
  /** Convert the graphql schema name via this thunk.*/
  convertName?: (name: string) => string
}

/** Default gen options. */
export const defaultGenOptions: GenOptions = {
  path: [],
  immutable: true,
  wrapperOptions: defaultWrapperOptions,
  defaultValue: undefined,
}
