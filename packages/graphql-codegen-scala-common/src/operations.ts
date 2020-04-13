import { OperationDefinitionNode, VariableDefinitionNode, isEnumType, DocumentNode, visit } from "graphql"
import * as graphql from "graphql"
import { pascalCase } from "pascal-case"
import OperationVariablesToObject from "./OperationVariablesToObject"
import { getRootType } from "./types"
import { ResolveContext, selectionSetToObject, ResolvedSelectionSet, ResolvedField } from "./selections"
import { Config, parseImport, fragmentDefinitions, AddTypename } from "./config"
import { log } from "./logger"
import { generateScalaJSTrait, generateScalaObject, GenerateTraitOptions } from "./trait"
import { makeGQLForScala } from "./gql"
import { GenOptions, typenameAlways, typenameOptional, PLVariableInfo, computeAddTypename } from "./plvariable"

/** Generate generic scala.js graphql data and data structures.
 * Each operation becomes one scala object.
 *
 * Unlike some of the other @graphql-codegen visitors we need to integrate
 * a "client" visitor for running over types as well as a "documents"
 * visitor to match up schema types so we can output both gql strings
 * for each operation but also the data structures which we design to be unique to each
 * operation. All fragments are grouped together
 * into a `Fragments` object that is referenced directly. We
 * make our own visitor object because class inherintance seemed messy and there
 * was not alot of code resue given the assumptions made in the provided
 * visitors.
 */
export class ScalaJSOperationsVisitor {
  protected _operationNameMappings: Record<string, string> = {}
  protected _variablesTransformer: OperationVariablesToObject
  protected _collectedOperations: OperationDefinitionNode[] = []

  constructor(public _config: Config) {
    const enumsNames = Object.keys(_config.schema.getTypeMap()).filter(tn => isEnumType(_config.schema.getType(tn)))

    this._variablesTransformer = new OperationVariablesToObject(
      _config.scalars,
      _config.convertName.bind(this),
      enumsNames,
      false,
      this.config.enumValues,
      _config.schema
    )
  }

  // _ vars are a waste
  public get config(): Config {
    return this._config
  }

  /** Output raw document. Must have gqlImport propName defined to produce gql function call. */
  protected _buildDocumentNodes = (node): string => {
    const raw = makeGQLForScala(node, this.config.fragmentObjectName, this.config.convertName)
    const rawOp = `val operationString = """${raw}"""`
    let docOp = ""
    if (this.config.gqlImport) {
      const parsed = parseImport(this.config.gqlImport)
      if (parsed.propName) {
        docOp = `val operation = ${parsed.propName}(operationString)`
      }
    }
    return [rawOp, docOp].filter(a => a).join("\n")
  }

  /** Start recursion through the types. */
  protected _buildOperationResultTypes = (
    node: OperationDefinitionNode,
    operationRootType: graphql.GraphQLObjectType
  ): string => {
    const logme = log.extend("_buildOperationResultType")
    const ctx = new ResolveContext(
      this._config.schema,
      fragmentDefinitions(this._config.fragments),
      this._config.scalars
    )
    const resolved = selectionSetToObject(ctx, operationRootType, node.selectionSet)
    logme(
      "Resolved selection set: type %O, fields: %O (simple: %d, complex: %d)",
      resolved.ofType,
      resolved.fields,
      resolved.leaves.length,
      resolved.complex.length
    )
    const genopts = {
      scalars: this.config.scalars,
      //objectsHaveParentType: "Data",
      path: ["Data"],
      enums: this.config.enumValues,
    } as GenOptions

    // __typename
    let theTypename = computeAddTypename(this.config.addTypename)

    // simple fields are easy
    const simpleFields = [...theTypename, ...(resolved ? resolved.leaves.map(f => f.toPLVariable(genopts)) : [])]

    // object fields require recursion
    const subObjects = resolved ? resolved.resolveComplex(ctx) : []
    const subObjectFields = subObjects.map(p =>
      p[0].toPLVariable({ ...genopts, convertTypeName: (tname: string) => `${pascalCase(p[0].name)}_${tname}` })
    )

    // generate recrusive (object fields) content
    const nested = subObjects
      .map(so =>
        renderRecursiveData(so[1], ctx, {
          config: this.config,
          path: ["Data"],
          convertName: (traitName: string) => `${pascalCase(so[0].name)}_${traitName}`,
          plvarOptions: (f: ResolvedField) => ({
            convertTypeName: (tname: string) => {
              logme(`Calling tname fiddler for ${tname}`)
              return f.isObject ? `${pascalCase(f.name)}_${tname}` : tname
            },
          }),
          traitOptions: {
            extends: this.config.operationDataTraitSupers,
            ignoreDefaultValuesInTrait: true,
          },
        })
      )
      .join("\n")

    logme(`${simpleFields.length} simple fields, ${subObjects.length} sub-object fields.`)
    logme(`Toplevel Data object direct fields: ${simpleFields.map(f => f.name)}`)
    logme(`   Subobject fields: ${subObjectFields.map(f => f.name)}`)

    return generateScalaJSTrait("Data", [...simpleFields, ...subObjectFields], {
      native: true,
      nested,
      ignoreDefaultValuesInTrait: true,
      // the top level data trait does not get the extension
      //extends: this.config.operationDataTraitSupers,
    })
  }

  protected _buildOperationVariables = (node: OperationDefinitionNode): string => {
    const logme = log.extend("_bulidOperationsVariables")
    logme(
      `Note that all default values for Variables will not be added either to the trait or the apply method. How should we handle them?`
    )
    if (node.variableDefinitions.length > 0) {
      const operationVariables = this._variablesTransformer.transform<VariableDefinitionNode>(node.variableDefinitions)
      return generateScalaJSTrait("Variables", operationVariables, {
        extends: this.config.operationVariablesTraitSupers,
        ignoreDefaultValuesInTrait: true,
      })
    }
    return ""
  }

  protected _buildScalaContainer = (
    node: OperationDefinitionNode,
    oname: string,
    operationRootType: graphql.GraphQLObjectType
  ): string => {
    try {
      return generateScalaObject(
        oname,
        [
          this._buildDocumentNodes(node),
          this._buildOperationVariables(node),
          this._buildOperationResultTypes(node, operationRootType),
        ].join("\n")
      )
    } catch (e) {
      log("Error generating scala container", e)
      return e.message
    }
  }

  /** The superclass method generates a document string that is not relevant to us. */
  public OperationDefinition = (node: OperationDefinitionNode): string => {
    // for dev, only process a few entries...
    //if (this._collectedOperations.length > 2) return null;

    this._collectedOperations.push(node)
    log(`Processing operation ${this._collectedOperations.length}: ${node.name.value}`)
    const [sythesized_op_name, op_name] = generateOperationName(node)
    // schema's listof all possible operations
    const operationRootType = getRootType(node.operation, this.config.schema)
    if (!operationRootType) throw new Error(`Unable to find root schema for operation type "${node.operation}"`)
    const operationRootSuffix = pascalCase(operationRootType.name)

    // outer object container name with operation type suffix if it's not there
    const objectNameSuffix: string = op_name.toLowerCase().endsWith(operationRootSuffix.toLowerCase())
      ? ""
      : operationRootSuffix
    const objectName = this.config.convertName(op_name, {
      suffix: objectNameSuffix,
    })
    const theObject = this._buildScalaContainer(node, objectName, operationRootType)

    this._operationNameMappings[op_name] = objectName

    return [theObject].filter(a => a).join("\n")
  }

  /** Provide comments listing the operation name wrangling. */
  public get nameWranglings(): string {
    return ["// ops mappings:"]
      .concat(Object.entries(this._operationNameMappings).map(n => `// ${n[0]} => ${n[1]}`))
      .join("\n")
  }
}

/** scala: Generate scala imports statements from a list of import strings, either direct scala
 * packages or in the form moduleName#propName (only moduleName is retained).
 */
export function genImports(list: Array<string>): string[] {
  return list
    .map(parseImport)
    .map(s => s.moduleName)
    .map(i => `import ${i}`)
}

let _unnamedCounter: number = 1

/** If operation is anonymous, generate a synthensized operation name otherwise
 * return the raw operation name.
 * Return tuple [name was synthensized, name]. Side effect of incrementing
 * hiddent state counter.
 */
export function generateOperationName(node: OperationDefinitionNode): [boolean, string] {
  const name = node.name && node.name.value
  if (name) {
    return [false, name]
  }
  return [true, `Unnamed_${_unnamedCounter++}_`]
}

export interface RecurseContext {
  /** The domain name path, each level of hierarchy (if any) is an element. */
  path: Array<string>
  /** Convert the name (leaf of the domain name) to a new name and use it for trait declaration. */
  convertName?: (traitName: string) => string
  /** Options for generating the trait. */
  traitOptions?: Partial<GenerateTraitOptions>
  /** Options for the fields in the trait being generated. */
  plvarOptions?: (f: ResolvedField) => Partial<GenOptions>
  /** Overall configuration. */
  config: Config
}

/** Render traits recursively, output hierarchical/dependent types.
 *
 * @note In scala, this would be a typeclass.
 */
export function renderRecursiveData(selects: ResolvedSelectionSet, ctx: ResolveContext, state: RecurseContext) {
  if (!selects) throw new Error("renderRecursiveData: selects is null")
  const logme = log.extend("renderRecursiveData")
  const base_name = selects.ofType.name
  const name = state.convertName ? state.convertName(base_name) : base_name
  const newstate: RecurseContext = { ...state, path: state.path.concat([name]) }
  const fqn = `${state.path.join(".")}.${name}`
  const genopts = {
    scalars: ctx.scalars,
    //objectsHaveParentType: newstate.path.join("."),
    path: newstate.path,
  } as GenOptions

  // easy fields
  // __typename
  let theTypename = computeAddTypename(state.config.addTypename)

  const directs = [
    ...theTypename,
    ...selects.leaves.map(f =>
      f.toPLVariable({
        ...genopts,
        ...(state.plvarOptions ? state.plvarOptions(f) : {}),
      })
    ),
  ]

  logme(`Generating trait ${name}`)

  const subObjects = selects.resolveComplex(ctx)
  const subObjectFields = subObjects.map(s =>
    s[0].toPLVariable({
      ...genopts,
      ...(state.plvarOptions ? state.plvarOptions(s[0]) : {}),
    })
  )
  // input objects are always pulled out to their own trait
  const nested = subObjects
    .filter(p => !graphql.isInputObjectType(p[0].field.type))
    .map(p =>
      renderRecursiveData(p[1], ctx, {
        ...newstate,
        convertName: (traitName: string) => `${pascalCase(p[0].name)}_${traitName}`,
      })
    )
    .join("\n")

  return generateScalaJSTrait(name, [...directs, ...subObjectFields], {
    native: true,
    nested,
    fqn,
    //extends: selects.supers
    ...state.traitOptions,
  })
}

/** Obtain a list of operations in the document. (non-mutating) */
export function findOperations(doc: DocumentNode): Array<OperationDefinitionNode> {
  const nodes: Array<OperationDefinitionNode> = []
  const result = visit(doc, {
    leave: {
      OperationDefinition(node: OperationDefinitionNode) {
        nodes.push(node)
      },
    },
  })
  return nodes
}
