import { OperationDefinitionNode, print, FragmentDefinitionNode } from "graphql"
import { extractFragments, genScalaFragmentReferencesForDocument } from "./fragments"
import { ConvertOptions, ConvertFn } from "@graphql-codegen/visitor-plugin-common"

/** Generate DocumentNode content with embedded fragment "string" includes.
 * The node parameter is searched downward for fragments and only those fragment
 * names are embedded into the document string representation. The generation
 * method assumes that embedded fragment names are prefixed by `fragmentObjectName`
 * and all fragments are found in subnodes of `node.`.
 *
 * @param node Content to convert to a string.
 * @param fragmentObjectName Prefix to fragment names embeded in GQL documents.
 * @param convertName Convert fragment names found in node to match what might be generated
 * elsewhere in the code base.
 * @param enhanceMarker Convert $ to $$ for string interpolation in scala. Default is false.
 */
export function makeGQLForScala(
  node: FragmentDefinitionNode | OperationDefinitionNode,
  fragmentObjectName: string,
  convertName?: ConvertFn<ConvertOptions>,
  enhanceMarker?: boolean
): string {
  const enhance = enhanceMarker ?? false
  const fragments = extractFragments(node)
  const thunk = (fname: string) =>
    genScalaFragmentReferencesForDocument(fragmentObjectName, convertName ? convertName(fname) : fname)
  return makeGQLWithThunk(node, thunk, enhance)
}

/** Extract fragments from document, use thunk to create language specific
 * embeddings referencing those fragments and generate the string version of the document.
 */
export function makeGQLWithThunk(
  node: FragmentDefinitionNode | OperationDefinitionNode,
  thunk: (fname: string) => string,
  enhanceMarker: boolean = false
): string {
  const fragment_names = extractFragments(node)
  const deduped = [...new Set(fragment_names)]
  const refs = deduped.map(fn => thunk(fn))
  return makeGQLWithFragments(node, refs, enhanceMarker)
}

/** Make GQL string from a node embedding the fragment references. The
 * fragment references should be language specific.
 */
export function makeGQLWithFragments(
  node: FragmentDefinitionNode | OperationDefinitionNode,
  fragmentReferences: Array<string>,
  enhanceMarker: boolean = false
): string {
  const fragments = extractFragments(node)
  const raw = enhanceMarker ? print(node).replace(/\$/g, "$$$") : print(node)
  const doc = `${raw.split("\\").join("\\\\")}
            ${fragmentReferences.join("\n")}`
  return doc
}
