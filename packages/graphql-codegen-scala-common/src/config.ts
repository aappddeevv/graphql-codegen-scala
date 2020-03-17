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
}

/** Final processed configuration taking into account defaults. */
export interface Config {
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
    schema,
    gqlImport: raw.gqlImport || null,
    convertName: convertFactory(raw),
    fragmentObjectName: raw.fragmentObjectName || "Fragment",
    scalars,
    skipTypeName: raw.skipTypename ?? false,
    enumValues: parseEnumValues(schema, raw.enumValues),
    fragments: raw.externalFragments || [],
    isolateFragments: raw.isolateFragments ?? true,
    outputOperationNameWrangling: raw.outputOperationNameWrangling ?? true,
    separateInterfaces: raw.separateInterfaces ?? true,
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
