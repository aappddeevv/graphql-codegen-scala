import { Config } from "./config"
import { isObjectType, GraphQLObjectType, isNonNullType } from "graphql"
import { GenerateTraitOptions, generateScalaJSTrait } from "./trait"
import { PLVariableInfo, createPLVariable, defaultGenOptions, GenOptions } from "./plvariable"
import { undefWrapperOptions, nullWrapperOptions, filterFieldsWithParents, interfaceNames } from "./types"
import { log } from "./logger"

const logme = log.extend("object-types")

/** Find all object types in the schema. */
export function findObjectTypes(config: Config) {
  return Object.entries(config.schema.getTypeMap()).filter(t => {
    const startsWith_ = t[0].startsWith("__")
    const isObType = isObjectType(t[1])
    const isPrimary = t[0] === "Query" || t[0] === "Mutation" || t[0] === "Subscription"
    return !startsWith_ && isObType && !isPrimary
  })
}

/** Generate object types. All types are at the same level versus hierarchically
 * structured as in the operation selections. It is configurable about whether
 * interfaces can be used versus repeating all of the fields in each object
 */
export function genObjectTypes(
  config: Config,
  options?: {
    trait?: Partial<GenerateTraitOptions>
    plvar?: Partial<GenOptions>
  }
): Array<string> {
  const objectTypes = findObjectTypes(config)
  logme(`Found ${objectTypes.length} object types.`)
  const x: Array<[string, Array<PLVariableInfo>, Partial<GenerateTraitOptions>]> = objectTypes.map(p => {
    const name = p[0]
    const objectType = p[1] as GraphQLObjectType
    const genopts = {
      scalars: config.scalars,
      enums: config.enumValues,
      immutable: true,
      wrapperOptions: nullWrapperOptions,
      ...options?.plvar,
    }

    const allFields = Object.values(objectType.getFields())
    const allFieldsConverted = allFields.map(f => createPLVariable(f.name, f.type, genopts))
    const directFieldNames = filterFieldsWithParents(config.schema, objectType).map(f => f.name)
    const directFields = allFieldsConverted.filter(plvar => directFieldNames.includes(plvar.name))
    const extraFields = allFieldsConverted.filter(plvar => !directFieldNames.includes(plvar.name))
    const plvars = config.separateInterfaces ? directFields : allFieldsConverted
    logme(
      `Type ${name}: # total fields: ${allFields.length}, # direct: ${directFields.length}, # extra: ${extraFields.length}, # fields for trait: ${plvars.length}, # extras: ${extraFields.length}`
    )

    const additionalOptions = config.separateInterfaces
      ? {
          companionExtraProperties: extraFields,
          companionIncludesAllProperites: true,
        }
      : {}

    return [
      name,
      plvars,
      {
        extends: config.separateInterfaces ? interfaceNames(objectType) : [],
        ...additionalOptions,
      },
    ]
  })

  return x.map(data => {
    const name = data[0]
    const plvars = data[1]
    const toptions = data[2]
    return generateScalaJSTrait(name, plvars, { ...toptions, ...options?.trait })
  })
}
