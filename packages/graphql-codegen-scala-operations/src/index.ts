// https://graphql-code-generator.com/docs/custom-codegen/write-your-plugin
import {
  PluginFunction,
  PluginValidateFn,
  Types
} from "@graphql-codegen/plugin-helpers";
import { LoadedFragment } from "@graphql-codegen/visitor-plugin-common";
import {
  GraphQLSchema,
  visit,
  concatAST,
  FragmentDefinitionNode,
  Kind
} from "graphql";
import {
  ScalaJSOperationsVisitor,
  genImports,
  genScalaFragmentBlock,
  makeGQLForScala,
  RawConfig,
  makeConfig,
  genEnums,
  genInputObjectTypes,
  debug_type,
  log,
  genInterfaceTypes
} from "@aappddeevv/graphql-codegen-scala-common";

export const plugin: PluginFunction<RawConfig> = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: RawConfig
) => {
  const logme = log.extend("plugin");
  const allAst = concatAST(documents.map(v => v.document));

  // Gather all fragments into one place since finding them on the
  // fly in the schema is painful.
  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(
      d => d.kind === Kind.FRAGMENT_DEFINITION
    ) as FragmentDefinitionNode[]).map(fragmentDef => ({
      node: fragmentDef,
      name: fragmentDef.name.value,
      onType: fragmentDef.typeCondition.name.value,
      isExternal: false
    })),
    ...(config.externalFragments || [])
  ];

  try {
    const final_config = makeConfig(schema, {
      ...config,
      externalFragments: allFragments
    });
/*
    Object.entries(schema.getTypeMap()).forEach(t => {
      logme("type", t[0]);
      debug_type(t[1]);
      logme("schema type %O", t[1]);
    });
*/

    const visitor = new ScalaJSOperationsVisitor(final_config);
    const visitorResult = visit(allAst, { leave: visitor as any });

    const inputObjectTypes = genInputObjectTypes(final_config, {
      trait: {
        native: true,
        ignoreDefaultValuesInTrait: true
      }
    }).join("\n");

    return {
      prepend: [
        ...genImports([
          "scala.scalajs.js",
          "js.|",
          ...(final_config.gqlImport ? [final_config.gqlImport] : [])
        ]),
        final_config.outputOperationNameWrangling ? visitor.nameWranglings : ""
      ],
      content: [
        genEnums(schema),
        genScalaFragmentBlock(
          final_config,
          final_config.fragments,
          final_config.fragmentObjectName,
          final_config.convertName,
          node =>
            makeGQLForScala(
              node,
              final_config.fragmentObjectName,
              final_config.convertName
            ),
          final_config.isolateFragments ? node => "" : node => ""
        ),
        inputObjectTypes,
        ...visitorResult.definitions.filter(t => typeof t === "string")
      ].join("\n")
    };
  } catch (e) {
    console.log("Error generating content", e);
    return { content: `Error generating content ${e.message}` };
  }
};

export const validate: PluginValidateFn<any> = async (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: any,
  outputFile: string
) => {
  if (!outputFile.endsWith(".scala")) {
    throw new Error(
      `Plugin "scalajs-client" requires output file extension to be ".scala"!`
    );
  }
};
