// https://graphql-code-generator.com/docs/custom-codegen/write-your-plugin
import { PluginFunction, PluginValidateFn, Types } from "@graphql-codegen/plugin-helpers"
import { LoadedFragment } from "@graphql-codegen/visitor-plugin-common"
import { GraphQLSchema, visit, concatAST, FragmentDefinitionNode, Kind } from "graphql"
import {
  ScalaJSOperationsVisitor,
  genImports,
  genScalaFragmentBlock,
  makeGQLForScala,
  RawConfig,
  makeConfig,
  genEnums,
  genInputObjectTypes,
} from "."

export const plugin: PluginFunction<RawConfig> = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: RawConfig
) => {
  const allAst = concatAST(documents.map(v => v.document))

  // Gather all fragments into one place since finding them on the
  // fly in the schema is painful.
  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION) as FragmentDefinitionNode[]).map(
      fragmentDef => ({
        node: fragmentDef,
        name: fragmentDef.name.value,
        onType: fragmentDef.typeCondition.name.value,
        isExternal: false,
      })
    ),
    ...(config.externalFragments || []),
  ]

  try {
    const final_config = makeConfig(schema, {
      ...config,
      externalFragments: allFragments,
    })

    Object.entries(schema.getTypeMap()).forEach(t => console.log(t))

    return {
      prepend: [],
      content: "",
    }
  } catch (e) {
    console.log("Error generating content", e)
    return { content: `Error generating content ${e.message}` }
  }
}
