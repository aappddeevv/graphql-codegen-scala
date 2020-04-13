import { isInputObjectType, GraphQLInputObjectType, isCompositeType } from "graphql"

// handle input types
import { Config } from "./config"
import { log } from "./logger"
import { createPLVariable, GenOptions } from "./plvariable"
import { GenerateTraitOptions, generateScalaJSTrait } from "./trait"
import { TraitRenderingInputs, undefNullWrapperOptions } from "./types"

const logem = log.extend("input-types")

/** Find and create rendering inputs for input types. */
export function findInputTypes(config: Config, options?: Partial<GenOptions>): Array<TraitRenderingInputs> {
  const inputTypes = Object.entries(config.schema.getTypeMap()).filter(p => isInputObjectType(p[1]))
  log(`Found ${inputTypes.length} input types to process.`)
  return inputTypes.flatMap(p => {
    const name = p[0]
    const t = p[1] as GraphQLInputObjectType
    const plvars = Object.entries(t.getFields()).map(f => {
      const fname = f[0]
      const ftype = f[1]
      // The spec says these cannot be objects, only enums, scalars, etc.
      // Should this be isCompositeType or isObject type?
      if (isCompositeType(ftype))
        throw new Error(`Expecting non-composite type for ${name}.${fname} but found ${ftype}`)
      return createPLVariable(fname, ftype.type, {
        ...options,
        ...(config.variant == "apollo"
          ? {
              wrapperOptions: undefNullWrapperOptions,
            }
          : {}),
      })
    })
    const description = t.description ? t.description : `Input type ${name}`
    return [
      [
        name,
        plvars,
        {
          description,
        },
      ],
    ]
  })
}

/** Find and render input objects. */
export function genInputObjectTypes(
  config: Config,
  options?: {
    plvar?: Partial<GenOptions>
    trait?: Partial<GenerateTraitOptions>
  }
): Array<String> {
  const x = findInputTypes(config, {
    scalars: config.scalars,
    enums: config.enumValues,
    ...options?.plvar,
  })
  return x.map(p => generateScalaJSTrait(p[0], p[1], { ...p[2], ...options?.trait }))
}
