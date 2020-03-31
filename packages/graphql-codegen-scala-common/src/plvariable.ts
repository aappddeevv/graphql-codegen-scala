import { GraphQLType, isNonNullType, isListType, isObjectType, isScalarType, getNamedType, isEnumType } from "graphql"
import { log } from "./logger"
import { mk_type_wrapper_thunk, WrapperOptions, defaultWrapperOptions } from "./types"
import { NormalizedScalarsMap, ParsedEnumValuesMap } from "@graphql-codegen/visitor-plugin-common"

/** A programming language type has a name and possible a path
 * that when put together is a QN. The QN may be
 * qualified only up to its parent inclosing object (scope) versus
 * to a package root. Hence the name QN verus FQN. We really need
 * to create scope objects and formalize all of this messiness.
 *
 * @note In scala, rendering would be a typeclass.
 */
export class PLType {
  constructor(public name: string, public path?: Array<string>) {}

  /** Renders to a `pathpart1.pathpart2.name` string. */
  public get dottedQN(): string {
    const upto = this.path ? this.path.join(".") : undefined
    return (upto ? `${upto}.` : "") + this.name
  }

  /** Return a FQN. */
  public get qn(): string {
    return this.dottedQN
  }

  /** Create a new PLType from this one with path part appended. */
  public addPathPart = (part: string) => new PLType(this.name, (this.path ?? []).concat([part]))
}

/** IR of a programming language variable declaration.
 */
export interface PLVariableInfo {
  /** Varible name. */
  readonly name: string
  /** Original name from graphql schema. Only include this if the name was transformed. */
  readonly originalName?: string
  /** "Base" type without wrapping for null/optionality which is what wrapper does if the type
   * name was modified to account for coding style or other code generation artifacts. This
   * name will *not* correspond to a type in the graphql schema.
   */
  readonly type: PLType
  /** Call the wrapper to generate the full type signature. Instead of a static set of
   * modifiers (which is what we should do), this can add layers of confusion to a type
   * around nullness and optionality at the code generation point. */
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
  const logme = log.extend("createPLVariable")
  logme("name: %s, type: %O, options: %O", name, type, opts)
  //debug_type(type);
  const named_type = getNamedType(type)
  const bottom_name = named_type.name
  let tname = undefined
  let domain = undefined
  // quest to determine tname
  const is_enum = isEnumType(named_type)
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
  logme("   scalar converted: %o, enum converted: %o, is enum: %o", scalar_converted, enum_converted, is_enum)
  // if it is not a scalar, adjust object name based on options
  if (!scalar_converted && !enum_converted && !is_enum) {
    const path_to_tname = isObjectType(named_type) && opts.objectsHaveParentType ? `${opts.objectsHaveParentType}.` : ""
    const converted_base_name = opts.convertTypeName ? opts.convertTypeName(tname) : tname
    tname = `${path_to_tname}${converted_base_name}`
    domain =
      isObjectType(named_type) && opts.objectsHaveParentType ? [opts.objectsHaveParentType] : opts.path ? opts.path : []
  }
  if (!tname) throw new Error(`While creating variable ${name}, type name was unresolved.`)

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
  /** Object types have a path prefix given by this value. If present, overrides `path`.
   * @deprecated Use `path`
   */
  objectsHaveParentType?: string
  /** Final scalar map to use if scalar type. */
  scalars?: NormalizedScalarsMap
  /** Final enums map. */
  enums?: ParsedEnumValuesMap
  /** Path to the type e.g. `package1.package2.typename`. Only used if
   * the type is not a scalar or enum type.
   */
  path?: Array<string>
  /** Mutability of variable. Default is true. */
  immutable?: boolean
  /** Options for `mk_type_wrapper_thunk`. */
  wrapperOptions?: Partial<WrapperOptions>
  /** Some type of default value. Very opaque. */
  defaultValue?: any
  /** Convert the name field via this thunk.*/
  convertName?: (name: string) => string
  /** Convert type name thunk. This changes the leaf part of the type name and is
   * independent of the `objectsHaveParentType` option.
   */
  convertTypeName?: (name: string) => string
}

/** Default gen options. */
export const defaultGenOptions: GenOptions = {
  path: [],
  immutable: true,
  wrapperOptions: defaultWrapperOptions,
  defaultValue: undefined,
}
