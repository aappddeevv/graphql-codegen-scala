import { LoadedFragment } from "@graphql-codegen/visitor-plugin-common"
import { DepGraph } from "dependency-graph"
import {
  OperationDefinitionNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  visit,
  print,
  DocumentNode,
} from "graphql"
import { generateScalaObject } from "./trait"
import { Config } from "./config"

/** Find all FragmentDefinitionNode children. Dedup circles using a dependency graph. */
export function getFragments(fragments: Array<LoadedFragment>): FragmentDefinitionNode[] {
  const graph = fragmentsGraph(fragments)
  const orderedDeps = graph.overallOrder()
  const localFragments = orderedDeps.filter(name => !graph.getNodeData(name).isExternal)
  return localFragments.map(name => graph.getNodeData(name).node)
}

/** Generate graph of names=>document content mappings. */
export function fragmentsGraph(fragments: LoadedFragment[]): DepGraph<LoadedFragment> {
  const graph = new DepGraph<LoadedFragment>({ circular: true })

  for (const fragment of fragments) {
    if (graph.hasNode(fragment.name)) {
      const cachedAsString = print(graph.getNodeData(fragment.name).node)
      const asString = print(fragment.node)

      if (cachedAsString !== asString) {
        throw new Error(`Duplicated fragment called '${fragment.name}'!`)
      }
    }

    graph.addNode(fragment.name, fragment)
  }

  fragments.forEach(fragment => {
    const depends = extractFragments(fragment.node)

    if (depends && depends.length > 0) {
      depends.forEach(name => {
        graph.addDependency(fragment.name, name)
      })
    }
  })

  return graph
}

/** Extract out all FragmentSpread names in children AST nodes. */
export function extractFragments(document: FragmentDefinitionNode | OperationDefinitionNode): string[] {
  if (!document) {
    return []
  }

  const names = []

  visit(document, {
    enter: {
      FragmentSpread: (node: FragmentSpreadNode) => {
        names.push(node.name.value)
      },
    },
  })

  return names
}

/** Scan LoadedFragments for all fragments and generate a single scala object
 * containing their declarations as a DocumentNode via "gql". Operations
 * will reference these.
 */
export function genScalaFragmentBlock(
  config: Config,
  allFragments: Array<LoadedFragment>,
  objectName: string,
  makeVariableName: (node: FragmentDefinitionNode) => string,
  makeGQL: (node: FragmentDefinitionNode) => string,
  makeTraits?: (node: FragmentDefinitionNode) => string
): string {
  const fragment_docs = getFragments(allFragments)
  if (fragment_docs.length === 0) return ""
  const fragments = fragment_docs.map(doc => `val ${makeVariableName(doc)} = """"${makeGQL(doc)}"""`)
  const traits = makeTraits ? fragment_docs.map(f => makeTraits(f)).join("\n") : ""
  return generateScalaObject(objectName, fragments.join("\n"))
}

/** Specific to scala string templates, given fragment string names,
 * generate content for
 * placing fragment names into a gql document string.
 */
export function genScalaFragmentReferencesForDocument(prefix: string, fname: string) {
  return "${" + prefix + "." + fname + "}"
}
