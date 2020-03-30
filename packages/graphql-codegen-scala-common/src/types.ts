import {
  OperationTypeNode,
  GraphQLSchema,
  GraphQLType,
  isInputType,
  isOutputType,
  isNullableType,
  isNonNullType,
  isListType,
  isWrappingType,
  isLeafType,
  isObjectType,
  isScalarType,
  isCompositeType,
  isAbstractType,
  isEnumType,
  getNamedType,
  getNullableType,
  isInputObjectType,
  isInterfaceType,
  GraphQLObjectType,
} from "graphql"
import { log } from "./logger"
import { PLVariableInfo } from "./plvariable"
import { GenerateTraitOptions } from "./trait"

/** Given an OperationTypeNode , return the root (query,mutation,subscription) in the schema. */
export function getRootType(operation: OperationTypeNode, schema: GraphQLSchema) {
  switch (operation) {
    case "query":
      return schema.getQueryType()
    case "mutation":
      return schema.getMutationType()
    case "subscription":
      return schema.getSubscriptionType()
  }
}

/** Evaluate most is* predicate functions. Expand enums if is enum. */
export function expandIsType(t: GraphQLType) {
  return {
    isAbstract: isAbstractType(t),
    isComposite: isCompositeType(t),
    isEnum: isEnumType(t),
    enumValues: isEnumType(t)
      ? t
          .getValues()
          .map(v => `${v.value} (${typeof v.value})`)
          .join(", ")
      : "<na>",
    isInterface: isInterfaceType(t),
    isInput: isInputType(t),
    isInputObject: isInputObjectType(t),
    isList: isListType(t),
    isLeaf: isLeafType(t),
    isOutput: isOutputType(t),
    isNullable: isNullableType(t),
    isNonNull: isNonNullType(t),
    isObject: isObjectType(t),
    isScalar: isScalarType(t),
    isWrapping: isWrappingType(t),
    wrappedType: isWrappingType(t) ? t : "<na>",
    getNamedType: getNamedType(t),
    getNullableType: getNullableType(t),
  }
}

/*** Debug print a type using recursion to unwrap if needed. */
export function debug_type(t: GraphQLType, indent: number = 0, log = console.log) {
  const i = new Array(indent + 1).fill("  ").join("")
  const start = new Array(indent).fill("  ").join("")
  log(`${start}debug of type: '${t}'`)
  const x = {
    ...expandIsType(t),
  }
  Object.entries(x).forEach(e => log(`${i}${e[0]}: ${e[1]}`))
  if (isWrappingType(t)) {
    log(`${i}: expanding wrapping type`)
    debug_type(t.ofType, indent + 1)
  }
}

export interface WrapperOptions {
  mkList: (arg: string) => string
  mkOpt: (arg: string) => string
  mkOptZero: (arg: string) => string
  mkListZero: (arg: string) => string
}

/** Optional => T|Null */
export const nullWrapperOptions: WrapperOptions = {
  mkList: (arg: string) => `js.Array[${arg}]`,
  mkOpt: (arg: string) => `${arg}|Null`,
  mkOptZero: (arg: string) => "null",
  mkListZero: (arg: string) => "js.Array()",
}

/** Optional => js.Undef */
export const undefWrapperOptions: WrapperOptions = {
  mkList: (arg: string) => `js.Array[${arg}]`,
  mkOpt: (arg: string) => `js.UndefOr[${arg}]`,
  mkOptZero: (arg: string) => "js.undefined",
  mkListZero: (arg: string) => "js.Array()",
}

/** Default wrapper options. */
export const defaultWrapperOptions = nullWrapperOptions

/** Build a rendering thunk for the type. Takes
 * into account null and list types only i.e. wrapping types.
 */
export function mk_type_wrapper_thunk(t: GraphQLType, options?: Partial<WrapperOptions>): (arg: string) => string {
  if (!t) throw Error("Type was null in type wrapper generation")
  options = { ...defaultWrapperOptions, ...options }
  const original_type = t
  // if true then lt = false and nnt = false
  let w = isWrappingType(t)
  // these are hierarchical, its one or the other
  let lt = isListType(t)
  let nnt = isNonNullType(t)
  let ofType: GraphQLType | null = isWrappingType(t) ? t.ofType : null
  let ofTypeW = ofType ? isWrappingType(ofType) : false

  // should never happen
  if (isWrappingType(t) && !ofType)
    throw new Error(`Wrapping type ${t} but no ofType defined in type wrapper generation.`)

  const ops = []

  if (!w) ops.push("N")
  while (w) {
    let r = ""
    if (!nnt && !lt) r = "N"
    else if (lt) r = "L"
    else r = "-"
    // log(
    //   "determining type wrapper op",
    //   t,
    //   "wt:",
    //   w,
    //   ", lt:",
    //   lt,
    //   ", nnt:",
    //   nnt,
    //   ", ofType:",
    //   ofType,
    //   ", ofType wt:",
    //   ofTypeW,
    //   ", result => ",
    //   r
    // )
    ops.push(r)
    t = ofType
    w = t ? isWrappingType(t) : false
    if (t) {
      ofType = isWrappingType(t) ? t.ofType : null
      lt = isListType(t)
      nnt = isNonNullType(t)
    } else {
      ofType = null
      lt = false
      nnt = false
    }
  }

  return (targ: string) => {
    const r = ops.reduce((p, c) => {
      switch (c) {
        case "N":
          return options.mkOpt(p)
        case "L":
          return options.mkList(p)
        default:
          return p
      }
    }, targ)
    //log(`appyling type wrapper ops: original type '${original_type}'`, "arg", targ, "ops", ops, " => ", r)
    return r
  }
}

/** You need three pieces of information to render a trait. This is that. */
export type TraitRenderingInputs = [string, Array<PLVariableInfo>, Partial<GenerateTraitOptions>]

/** Given a type remove all fields that are in the "parents". Filtering performed by name.
 * Parents cannot have overlapping field names in graphql but your programming language
 * can use actual inheritance.
 */
export function filterFieldsWithParents(schema: GraphQLSchema, target: GraphQLObjectType) {
  const allFields = target.getFields()
  // construct parent types master list
  const parents = target.getInterfaces().flatMap(tm => Object.values(tm.getFields()).map(t => t.name))
  return Object.values(allFields).filter(f => !parents.includes(f.name))
}

/** Return a list of interface names or if none, an empty array. */
export function interfaceNames(target: GraphQLObjectType) {
  return target.getInterfaces().map(i => i.name)
}
