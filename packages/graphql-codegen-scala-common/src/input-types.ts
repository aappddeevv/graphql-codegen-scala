import { isInputType, isInputObjectType, GraphQLInputObjectType, isObjectType, isCompositeType } from "graphql"

// handle input types
import { Config } from "./config"
import { log } from "./logger"
import { PLVariableInfo, createPLVariable, GenOptions } from "./plvariable"
import { GenerateTraitOptions, generateScalaJSTrait } from "./trait"

export function findInputTypes(
  config: Config,
  options?: Partial<GenOptions>
): Array<[string, Array<PLVariableInfo>, Partial<GenerateTraitOptions>]> {
  const inputTypes = Object.entries(config.schema.getTypeMap()).filter(p => isInputObjectType(p[1]))
  return inputTypes.map(p => {
    const name = p[0]
    const inputObjectType = p[1] as GraphQLInputObjectType
    const plvars = Object.entries(inputObjectType.getFields()).map(f => {
      const fname = f[0]
      const ftype = f[1]
      // The spec says these cannot be objects, only enums, scalars, etc.
      // Should this be isCompositeType or isObject type?
      if (isCompositeType(ftype))
        throw new Error(`Expecting non-composite type for ${name}.${fname} but found ${ftype}`)
      return createPLVariable(fname, ftype.type, {
        ...options,
      })
    })
    return [
      name,
      plvars,
      {
        description: `Input type ${name}`,
      },
    ]
  })
}

export function genInputObjectTypes(
  config: Config,
  options?: {
    plvar?: Partial<GenOptions>
    trait?: Partial<GenerateTraitOptions>
  }
): Array<String> {
  const x = findInputTypes(config, options?.plvar)
  return x.map(p => generateScalaJSTrait(p[0], p[1], { ...p[2], ...options?.trait }))
}
