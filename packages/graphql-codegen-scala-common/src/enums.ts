import { GraphQLSchema, isEnumType, GraphQLEnumType } from "graphql";
import { pascalCase } from "pascal-case";

/** Generate string representing enums. */
export function genEnums(
  schema: GraphQLSchema,
  options?: EnumGenerationOptions
) {
  options = { ...defaultEnumGenerationOptions, ...options };
  return findAllEnums(schema)
    .map(t =>
      options.excludes.includes(t.name)
        ? null
        : renderEnumDefinition(t, options)
    )
    .filter(a => a)
    .join("\n");
}

/** Find all schema entries that are enums. */
export function findAllEnums(schema: GraphQLSchema) {
  return Object.entries(schema.getTypeMap())
    .map(kv => {
      const n = kv[0];
      const t = kv[1];
      return isEnumType(t) ? t : null;
    })
    .filter(a => a);
}

/** Code generation options for enums. */
export interface EnumGenerationOptions {
  /** Use names as values instead of any values found in the schema. */
  useNames?: boolean;
  /** Upcase the generated scala artifact name. Does not apply to individual enum values. */
  upcase?: boolean;
  /** Exclude some names from being generated. */
  excludes?: Array<string>;
}

/** Default for enum code generation. */
export const defaultEnumGenerationOptions: EnumGenerationOptions = {
  useNames: false,
  upcase: true,
  excludes: ["__DirectiveLocation", "__TypeKind", "CacheControlScope"]
};

/** Enums are mostly rendered on their own at the top level since
 * they do not have any real dependencies. Generate enum using
 * standard scala.js idiom for enums.
 */
export function renderEnumDefinition(
  t: GraphQLEnumType,
  options?: EnumGenerationOptions
) {
  options = { ...defaultEnumGenerationOptions, ...options };
  let str = [];
  const name = options.upcase ? pascalCase(t.name) : t.name;
  str.push(`/** ${t.description ?? "Enum " + name}`);
  str.push(` * Schema name: ${t.name}`);
  str.push(" */");
  str.push("@js.native");
  str.push(`abstract trait ${name} extends js.Any`);
  str.push(`object ${name} {`);
  // for each value generate a val
  t.getValues().forEach(v => {
    const vname = v.name;
    const vvalue = options.useNames
      ? vname
      : v.value
      ? v.value.toString()
      : vname;
    str.push(`val ${vname} = "${vvalue}".asInstanceOf[${name}]`);
  });
  str.push("}");
  return str.join("\n");
}
