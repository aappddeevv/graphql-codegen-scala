import { pascalCase } from "pascal-case"
import { getRootType } from "./types"
import { log } from "./logger"
import { PLVariableInfo } from "./plvariable"

const logme = log.extend("trait")

/** Target platform. */
export enum PlatformTarget {
  SCALA,
  SCALAJS,
}

/** Trait generation options. Large bag values :-)
 *
 */
export interface GenerateTraitOptionsCommon {
  nested: string
  includeCompanion: boolean
  includeCopy: boolean
  includeApply: boolean
  /** Include an unapply method. If there are more than 22 vars, it is skipped
   * due to scala tuple limitations.
   */
  includeUnapply: boolean
  /** In the trait definition itself, ignore member default values for all members. This flag
   * does not apply to companion object function definions like `apply`.
   */
  ignoreDefaultValuesInTrait?: boolean
  /** When creating objects using js.Dynamic.literal, values must be js.Any.
   * Use this thunk to massage the value into the right expression.
   */
  dynamicValueConversion: (value: string) => string
  /** Trait extends/withs. It is possible that a render automatically adds its own extend classes. */
  extends?: ReadonlyArray<string>
  /** If defined, use this fqn instead of the name in all places except trait and object declaration. */
  fqn?: string
  /** Whether generation is for scalajs. This should probably be an enum. */
  scalajs?: boolean
  /** Target platform. Not used yet as I'm not sure its needed--wish we had
   * typeclass and implicits in typescript.
   */
  target: PlatformTarget
  /** Trait description. */
  description?: string
  /** Generate a comment string for a property member *not* for the trait. */
  makeComment?: (s: string) => string
  /** Generate a trait level description. */
  makeDescription?: (s: string) => string
  /** If companion methods are generated, use all properties and
   * not just the ones declared in the immediate trait.
   */
  companionIncludesAllProperties?: boolean
  /** If companionIncludesAllProperties is true, these properties are also included
   * in companion methods.
   */
  companionExtraProperties?: Array<PLVariableInfo>
  /** Trait modifiers added to any implicitly added by the generator, e.g., `@coolannotation`. */
  mods: Array<string>
}

/** Trait generation options. */
export interface GenerateTraitOptions extends GenerateTraitOptionsCommon {
  /** If trait should have `@js.native` added. */
  native: boolean
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
  dynamicValueConversion: (value: string) => `${value}.asInstanceOf[_root_.scala.scalajs.js.Any]`,
  makeComment: (s: string) => `// ${s}`,
  makeDescription: (s: string) => `/** ${s} */`,
  extends: [],
  target: PlatformTarget.SCALA,
  companionIncludesAllProperties: true,
  companionExtraProperties: [],
  mods: [],
}

/** Defalut options for scala.js generation. Don't use this yet. */
export const scalaJSDefaultOptions: GenerateTraitOptions = {
  ...defaultOptions,
  target: PlatformTarget.SCALAJS,
  extends: ["_root_.scala.scalajs.js.Object"],
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
 *
 * @param name Name of trait. This is not mangled by anything in the options so it should be the final name.
 */
export function generateScalaJSTrait(
  name: string,
  variables: Array<PLVariableInfo>,
  options?: Partial<GenerateTraitOptions>
) {
  const logmeth = logme.extend("generateTrait")
  const opts = { ...defaultOptions, ...options } as GenerateTraitOptions
  logmeth(`Generate trait: ${name}`)
  logmeth("   options: %O", opts)
  const fqn = opts.fqn ?? name
  const declarations = variables.map(info => {
    const comment = opts.makeComment && info.comment ? opts.makeComment(info.comment) + "\n" : ""
    const decl = info.immutable ?? true ? "val" : "var"
    const defaultValuePart = opts.ignoreDefaultValuesInTrait ? "" : info.defaultValue ? ` = ${info.defaultValue}` : ""
    const mapping =
      info.originalName && opts.scalajs ? `@_root_.scala.scalajs.js.annotation.Name(${info.originalName})` : ""
    return `${comment} ${mapping} ${decl} ${info.name}: ${info.wrapper(info.type.qn)}${defaultValuePart}`
  })

  const description = opts.makeDescription && opts.description ? [opts.makeDescription(opts.description)] : []
  const supers = [...(opts.scalajs ? ["_root_.scala.scalajs.js.Object"] : []), ...(opts.extends ?? [])]

  logmeth(`Trait ${name}`)
  logmeth(`      properties (${declarations.length}): ${variables.map(v => v.name)}`)
  const allMods = [...(opts.native ? ["@js.native"] : []), ...(opts.mods ? opts.mods : [])]
  logmeth(`      modifiers: ${allMods}`)

  const trait = [
    ...description,
    `${allMods.join(" ")} trait ${name} ${createExtends(supers).join(" ")} {`,
    declarations.join("\n"),
    "}",
  ]

  const include_extras = options.companionIncludesAllProperties ?? true
  const extras = include_extras ? options.companionExtraProperties ?? [] : []

  // alias for below, because 'variables' is too long :-)
  const v = variables.concat(extras)
  logmeth(`Companion object ${name} will deploy ${v.length} properties. # extra properties was ${extras.length}.`)
  logmeth(`   Include extras? ${include_extras}`)

  const companion_copy = () => `implicit class Copy(private val orig: ${fqn}) extends AnyVal {
    def copy(${v.map(d => `${d.name}: ${d.wrapper(d.type.qn)}=orig.${d.name}`).join(", ")}) =
      _root_.scala.scalajs.js.Dynamic.literal(${v
        .map(d => `"${d.name}" -> ${opts.dynamicValueConversion(d.name)}`)
        .join(", ")}).asInstanceOf[${fqn}]
    }`

  // if variables is empty, are any of these invalid???
  const companion_apply = () => `
          def apply(${v
            .map(d => `${d.name}: ${d.wrapper(d.type.qn)} ${d.defaultValue ? `= ${d.defaultValue}` : ""}`)
            .join(",")}) = 
            _root_.scala.scalajs.js.Dynamic.literal(${v
              .map(d => `"${d.name}" -> ${opts.dynamicValueConversion(d.name)}`)
              .join(", ")}).asInstanceOf[${fqn}]
              `
  const companion_unapply = () =>
    v.length < 22
      ? `
          def unapply(value: ${fqn}) =
             Some((${v.map(d => `value.${d.name}`).join(", ")}))
          `
      : ""

  const companion = opts.includeCompanion
    ? [
        `object ${name} {`,
        opts.includeApply ? companion_apply() : "",
        opts.includeUnapply ? companion_unapply() : "",
        opts.includeCopy ? companion_copy() : "",
        ...(opts.nested ? [options.nested] : []),
        `} // end ${name} companion`,
      ]
    : []

  return [...trait, ...companion].join("\n")
}
