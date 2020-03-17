import { pascalCase } from "pascal-case"
import { getRootType } from "./types"
import { log } from "./logger"
import { PLVariableInfo } from "./plvariable"

/** Trait generation options. Large bag values :-) */
export interface GenerateTraitOptions {
  /** If trait should have `@js.native` added. */
  native: boolean
  nested: string
  includeCompanion: boolean
  includeCopy: boolean
  includeApply: boolean
  includeUnapply: boolean
  /** In the trait definition itself, ignore member default values for all members. This flag
   * does not apply to companion object function definions like `apply`.
   */
  ignoreDefaultValuesInTrait?: boolean
  /** When creating objects using js.Dynamic.literal, values must be js.Any.
   * Use this thunk to massage the value into the right expression.
   */
  dynamicValueConversion: (value: string) => string
  /** Trait extends/withs. */
  extends?: ReadonlyArray<string>
  /** If defined, use this fqn instead of the name in all places except trait and object declaration. */
  fqn?: string
  /** Whether generation is for scalajs. */
  scalajs?: boolean
  /** Trait description. */
  description?: string
  /** Generate a comment string for a property member *not* for the trait. */
  makeComment?: (s: string) => string
  /** Generate a trait level description. */
  makeDescription?: (s: string) => string
}

/** Default trait generation options for scala.js. */
export const defaultOptions: GenerateTraitOptions = {
  native: false,
  includeCompanion: true,
  includeCopy: true,
  includeApply: true,
  includeUnapply: true,
  ignoreDefaultValuesInTrait: false,
  fqn: undefined,
  scalajs: true,
  nested: "",
  dynamicValueConversion: (value: string) => `${value}.asInstanceOf[js.Any]`,
  makeComment: (s: string) => `// ${s}`,
  makeDescription: (s: string) => `/** ${s} */`,
  extends: [],
}

/** Generate an object with some nested content. Very simple
 * model that is opaque to the child content.
 */
export function generateScalaObject(name: string, nested?: string | null) {
  return [`object ${name} {`, nested, `} // end ${name} object`].filter(a => a).join("\n")
}

/** Return an array with "extends" and "withs" property
 * inserted based on the order of the input parameter. You
 * still need to join the array with a space between: `rval.join(" ")`.
 */
export function createExtends(e: ReadonlyArray<string>) {
  if (e.length === 0) return []
  else if (e.length === 1) return ["extends", ...e]
  return ["extends", e[0], ...e.slice(1).flatMap(x => ["with", x])]
}

/** Generate a trait with a companion object and additional "helper"
 * methods. You can nest raw content using `options.nested`.
 */
export function generateScalaJSTrait(
  name: string,
  variables: Array<PLVariableInfo>,
  options?: Partial<GenerateTraitOptions>
) {
  const logme = log.extend("generateTrait")
  logme(
    `trait name ${name}, fields`,
    variables.map(p => ({
      name: p.name,
      type: p.type,
    }))
  )
  const opts = { ...defaultOptions, ...options } as GenerateTraitOptions
  const fqn = opts.fqn ?? name
  const declarations = variables.map(info => {
    const comment = opts.makeComment && info.comment ? opts.makeComment(info.comment) + "\n" : ""
    const decl = info.immutable ?? true ? "val" : "var"
    const defaultValuePart = opts.ignoreDefaultValuesInTrait ? "" : info.defaultValue ? ` = ${info.defaultValue}` : ""
    const mapping = info.originalName && opts.scalajs ? `@scala.scalajs.js.annotation.Name(${info.originalName})` : ""
    return `${comment} ${mapping} ${decl} ${info.name}: ${info.wrapper(info.type.name)}${defaultValuePart}`
  })

  const description = opts.makeDescription && opts.description ? [opts.makeDescription(opts.description)] : []
  const supers = [...(opts.scalajs ? ["scala.scalajs.js.Object"] : []), ...(opts.extends ?? [])]

  const trait = [
    ...description,
    opts.native ? "@js.native" : "",
    `trait ${name} ${createExtends(supers).join(" ")} {`,
    declarations.join("\n"),
    "}",
  ]

  const v = variables // alias for below

  const companion_copy = `implicit class Copy(private val orig: ${fqn}) extends AnyVal {
    def copy(${v.map(d => `${d.name}: ${d.wrapper(d.type.name)}=orig.${d.name}`).join(", ")}) =
      js.Dynamic.literal(${v
        .map(d => `"${d.name}" -> ${opts.dynamicValueConversion(d.name)}`)
        .join(", ")}).asInstanceOf[${fqn}]
    }`

  // if variables is empty, are any of these invalid???
  const companion_apply = `
          def apply(${v
            .map(d => `${d.name}: ${d.wrapper(d.type.name)} ${d.defaultValue ? `= ${d.defaultValue}` : ""}`)
            .join(",")}) = 
            js.Dynamic.literal(${v
              .map(d => `"${d.name}" -> ${opts.dynamicValueConversion(d.name)}`)
              .join(", ")}).asInstanceOf[${fqn}]
              `
  const companion_unapply = `
          def unapply(value: ${fqn}) =
             Some((${v.map(d => `value.${d.name}`).join(", ")}))
          `

  const companion = opts.includeCompanion
    ? [
        `object ${name} {`,
        opts.includeApply ? companion_apply : "",
        opts.includeUnapply ? companion_unapply : "",
        opts.includeCopy ? companion_copy : "",
        ...(opts.nested ? [options.nested] : []),
        `} // end ${name} companion`,
      ]
    : []

  return [...trait, ...companion].join("\n")
}
