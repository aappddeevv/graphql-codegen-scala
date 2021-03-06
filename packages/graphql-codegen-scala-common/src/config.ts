import {
  convertFactory,
  NamingConvention,
  ConvertOptions,
  ConvertFn,
  buildScalars,
  ScalarsMap,
  NormalizedScalarsMap,
  EnumValuesMap,
  ParsedEnumValuesMap,
  LoadedFragment,
} from "@graphql-codegen/visitor-plugin-common"
import { GraphQLSchema } from "graphql"
import { DEFAULT_SCALARS } from "./scalars"
import { parseEnumValues } from "./enum-values"

/** Raw configuration filled in by the @graphql-codgen layer. Do not use Partial<> here as
 * there may be some required fields one day.
 */
export interface RawConfig {
  /** Output variant. For now this is always "apollo". */
  variant?: string
  /** For declaring documents in scala objects. If missing,
   * parsed document members are not added but the raw strings are still be added.
   */
  gqlImport?: string
  /** Applies to type names and enum values. Example, lower-case#lowerCase or upper-case#upperCase.
   * Default is pascal-case#pascalCase. Thsi is not used consistently yet so be careful when using it.
   */
  namingConvention?: NamingConvention
  /** Name of the fragment object that declares all fragment strings. Default is `Fragment` */
  fragmentObjectName?: string
  /** Scalar mappings, either replacements or additions. */
  scalars?: ScalarsMap
  /** Does not add __typename to the generated type, unless it was specified. Default is false. */
  skipTypename?: boolean
  /** Override enum values in the config. */
  enumValues?: EnumValuesMap
  /** Externally loaded fragments. */
  externalFragments?: LoadedFragment[]
  /** Isolate fragments into their own trait. Default is true. Not sure this works yet. */
  isolateFragments?: boolean
  /** When outputting operations, output a comment with graphql names to wrangled mapping names. Default is true. */
  outputOperationNameWrangling?: boolean
  /** Interface should be declared separately and inheritance used. Default is true.*/
  separateInterfaces?: boolean
  /** Data traits in operations will extend these classes. NOT SURE THIS IS GOOD. DON'T USE.
   * Only applies to types enclosed by the topmost Data trait for each operation.
   */
  operationDataTraitSupers?: Array<string>
  /** Operation "Variables" trait extensions. DON'T USE. */
  operationVariablesTraitSupers?: Array<string>
  /** Type traits generated from the schema will extend these classes. DON'T USE. */
  typeTraitSupers?: Array<string>
  /** Add non-optional __typename to all relevant client operation types. The string value "always"
   * makes the variables non-optional which is good when your server always adds it to types
   * and "optional" adds it with js.UndefOr. The default is "exclude".
   */
  addTypename?: AddTypename
  /** When outputing schema types, output a `*Generic` object for each object type found.
   * The generic objects have all the properties in one trait and each property is
   * wrapped in `js.UndefOr`. Ensure that you are not already forcing optional values
   * into `js.UndefOr` otherwise it will be wrapped twice, which is not what you want.
   * These traits are conservative cast targets from the types returned in operations
   * and allow you to cast an operation return type to a "generic" type. You lose ergonomics
   * in that you must handle potentially missing fields since the return type for an
   * operation will usually not include all attributes. Default is true. These generic
   * types are targetted towards UI work where you need to write components
   * that take into account all possible fields, not just those that are returned
   * from a specific query.
   */
  includeSchemaGenerics?: boolean
  /** If includeSchemaGenerics is true, this the extension name on the type to use. Defaults to `Generic`. */
  schemaGenericsExtension?: string
  /** For operations only, add an extension method that casts to the generic schema
   * trait for each response object. If you need to write a function that acts against
   * any version of a schema object regardless of the response shape of the operation, use the
   * extension method generated from this option to obtain a "generic" version of the response type.
   * Compilation of the output will fail if you do not use `includeSchemaGenerics: true` in the
   * schema generation task. The default extension method name is `toSchemaType`.
   *
   * The result of the extension method reshapes the entire type subtree where you call
   * the extension method since the schema object
   * will contain a hierarchy separate from the response shape type hierarchy.
   * If you generated schema generics (see `includeSchemaGenerics` and `schemaGenericsExtension`)
   * then you need to ensure you use the same `schemaGenericsExtension` in your
   * operation codegen config. Since you may generate your schema into a different "package"
   * the configuration value can take the form of `package` or `package#conversionFunctionName` or `#conversionFunctionName`
   * so that it references the generated generic shape in the correct package. If you
   * just use the value true, then all of the defaults are used and the same package
   * used for generating the operation's scala package are used to reference the generic type.
   * Default is false. A conversion function is generated at each nested level of the type
   * hierarchy so you can genericize at any level of the response shape.
   */
  addGenericConversionExtensionMethod?: string | boolean
}

export type AddTypename = "always" | "optional" | "exclude"

/** Final processed configuration taking into account defaults. */
export interface Config {
  variant: string
  schema: GraphQLSchema
  gqlImport: string | null
  convertName: ConvertFn<ConvertOptions>
  fragmentObjectName: string
  scalars: NormalizedScalarsMap
  skipTypeName: boolean
  enumValues: ParsedEnumValuesMap
  /** All fragments, side-loaded as well as originally in the op docs. */
  fragments: LoadedFragment[]
  isolateFragments: boolean
  outputOperationNameWrangling: boolean
  separateInterfaces: boolean
  operationDataTraitSupers: Array<string>
  operationVariablesTraitSupers: Array<string>
  typeTraitSupers: Array<string>
  addTypename: AddTypename
  includeSchemaGenerics: boolean
  schemaGenericsExtension: string
  addGenericConversionExtensionMethod: string | boolean
}

/** Given a list of LoadedFragment objects, return the raw FragmentDefinitionNode AST
 * objects.
 */
export function fragmentDefinitions(lf: ReadonlyArray<LoadedFragment>) {
  return lf.map(lf => lf.node)
}

/** Make a Config from a RawConfig. */
export function makeConfig(schema: GraphQLSchema, raw: RawConfig): Config {
  const parsedScalarsMap = buildScalars(schema, raw.scalars, DEFAULT_SCALARS)
  const scalars = {}
  Object.keys(parsedScalarsMap).forEach(key => {
    scalars[key] = parsedScalarsMap[key].type
  })
  return {
    variant: raw.variant ?? "apollo",
    schema,
    gqlImport: raw.gqlImport ?? null,
    convertName: convertFactory(raw),
    fragmentObjectName: raw.fragmentObjectName ?? "Fragment",
    scalars,
    skipTypeName: raw.skipTypename ?? false,
    enumValues: parseEnumValues(schema, raw.enumValues),
    fragments: raw.externalFragments ?? [],
    isolateFragments: raw.isolateFragments ?? true,
    outputOperationNameWrangling: raw.outputOperationNameWrangling ?? true,
    separateInterfaces: raw.separateInterfaces ?? true,
    operationDataTraitSupers: raw.operationDataTraitSupers,
    operationVariablesTraitSupers: raw.operationVariablesTraitSupers,
    typeTraitSupers: raw.typeTraitSupers,
    addTypename: raw.addTypename ?? "exclude",
    includeSchemaGenerics: raw.includeSchemaGenerics ?? true,
    schemaGenericsExtension: raw.schemaGenericsExtension ?? "Generic",
    addGenericConversionExtensionMethod: raw.addGenericConversionExtensionMethod ?? false,
  }
}

/** Parse an import config element in the form moduleName#propName */
export function parseImport(s: string) {
  const [mname, pname] = s.split("#")
  return {
    moduleName: mname,
    propName: pname,
  }
}
