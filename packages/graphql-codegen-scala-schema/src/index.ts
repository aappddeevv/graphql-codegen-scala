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
  genImports,
  RawConfig,
  makeConfig,
  genEnums,
  genObjectTypes,
  genInputObjectTypes,
  genInterfaceTypes
} from "@aappddeevv/graphql-codegen-scala-common";

export const plugin: PluginFunction<RawConfig> = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: RawConfig
) => {
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

    const inputObjectTypes = genInputObjectTypes(final_config).join("\n");

    const interfaceTypes = final_config.separateInterfaces
      ? genInterfaceTypes(final_config, {
          trait: {
            native: false,
            ignoreDefaultValuesInTrait: true,
            includeCompanion: true
          }
        }).join("\n")
      : "";

    const objectTypes = genObjectTypes(final_config, {
      trait: {
        ignoreDefaultValuesInTrait: true
      }
    }).join("\n");

    return {
      prepend: [
        ...genImports([
          "scala.scalajs.js",
          "js.|",
          ...(final_config.gqlImport ? [final_config.gqlImport] : [])
        ])
      ],
      content: [
        genEnums(schema),
        interfaceTypes,
        inputObjectTypes,
        objectTypes
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
