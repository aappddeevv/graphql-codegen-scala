import { GraphQLInputObjectType, isInterfaceType } from "graphql"

import { Config } from "./config"
import { log } from "./logger"
import { createPLVariable, GenOptions } from "./plvariable"
import { GenerateTraitOptions, generateScalaJSTrait } from "./trait"
import { TraitRenderingInputs } from "./types"

const logme = log.extend("interface-types")

/** Find and create rendering inputs for interface types. */
export function findInterfaceTypes(config: Config, options?: Partial<GenOptions>): Array<TraitRenderingInputs> {
  const types = Object.entries(config.schema.getTypeMap()).filter(p => isInterfaceType(p[1]))
  logme(`Found ${types.length} interface types to process.`)
  return types.map(p => {
    const name = p[0]
    const t = p[1] as GraphQLInputObjectType
    const plvars = Object.entries(t.getFields()).map(f => {
      const fname = f[0]
      const ftype = f[1]
      return createPLVariable(fname, ftype.type, {
        ...options,
      })
    })
    // may be empty string! use ? not ??
    const description = t.description ? t.description : `Interface type ${name}`
    return [
      name,
      plvars,
      {
        description,
      },
    ]
  })
}

/** Render interface types. */
export function genInterfaceTypes(
  config: Config,
  options?: {
    plvar?: Partial<GenOptions>
    trait?: Partial<GenerateTraitOptions>
  }
): Array<String> {
  const x = findInterfaceTypes(config, {
    scalars: config.scalars,
    enums: config.enumValues,
    ...options?.plvar,
  })
  return x.map(p => generateScalaJSTrait(p[0], p[1], { ...p[2], ...options?.trait }))
}
