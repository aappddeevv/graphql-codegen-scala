import {
  NormalizedScalarsMap,
  ConvertNameFn,
  BaseVisitorConvertOptions,
  ParsedEnumValuesMap,
  getBaseTypeNode,
} from "@graphql-codegen/visitor-plugin-common"
import { VariableNode, TypeNode, ValueNode, NameNode, Kind, GraphQLSchema, typeFromAST, NamedTypeNode } from "graphql"
import { mk_type_wrapper_thunk, undefWrapperOptions } from "./types"
import { log } from "./logger"
import { PLVariableInfo, PLType } from "./plvariable"

/** Input data structure. These are all AST-based nodes and have not
 * been refinde to GraphQLTypes.
 */
export interface VariableLike {
  readonly name?: NameNode
  readonly variable?: VariableNode
  readonly type: TypeNode
  readonly defaultValue?: ValueNode
}

/** Factory to help transform operation variable definitions to
 * target language variables. Operation variables are input values into
 * a query/mutation/subscription that can are reused in
 * different parts of the operation.
 *
 * @depracated Use other things to do this then retire this class.
 */
export class OperationVariablesToObject {
  constructor(
    protected _scalars: NormalizedScalarsMap,
    protected _convertName: ConvertNameFn<BaseVisitorConvertOptions>,
    protected _enumNames: string[] = [],
    protected _enumPrefix = true,
    protected _enumValues: ParsedEnumValuesMap = {},
    protected _schema: GraphQLSchema
  ) {}
  private logme = log.extend("OperationVariablesToObject")

  public getName = <T extends VariableLike>(node: T): string => {
    if (node.name) {
      // who would replace the node.name with just a string? AST borken?
      if (typeof node.name === "string") {
        return node.name
      }

      return node.name.value
    } else if (node.variable) {
      return node.variable.name.value
    }
    return null
  }

  /** Create `<varname>: <typename>` strings foreach operation variable.
   * Still needs scala val/var and default values added.
   */
  public transform<T extends VariableLike>(variablesNode: ReadonlyArray<T>): Array<PLVariableInfo> {
    if (!variablesNode || variablesNode.length === 0) {
      return []
    }
    return variablesNode.map(variable => this.transformVariable(variable))
  }

  /** Setup to recurse through the types, but we have wrapper thunk. */
  public wrapAstTypeWithModifiers = (baseType: string, typeNode: TypeNode): string => {
    return baseType
  }

  /** In ts world, they output a type mapper for scalars. scala
   * uses the resulting scalar value directly. But in scala3 we could
   * use this feature but it may not be worth it.
   */
  protected getScalar = (name: string) => name

  protected transformVariable = <T extends VariableLike>(variable: T): PLVariableInfo => {
    let typeValue = null
    const prefix = ""
    this.logme("transformVariable: %O", variable)

    // if type is a string, use it directly
    if (typeof variable.type === "string") {
      typeValue = variable.type
    } else {
      const baseType = getBaseTypeNode(variable.type)
      const typeName = baseType.name.value

      if (this._scalars[typeName]) {
        //typeValue = this.getScalar(typeName);
        typeValue = this._scalars[typeName]
      } else if (this._enumValues[typeName] && this._enumValues[typeName].sourceFile) {
        typeValue = this._enumValues[typeName].typeIdentifier || this._enumValues[typeName].sourceIdentifier
      } else {
        // ???
        typeValue = `${prefix}${this._convertName(baseType, {
          useTypesPrefix: this._enumNames.includes(typeName) ? this._enumPrefix : true,
        })}`
      }
    }

    const fieldName = this.getName(variable)
    const fieldType = this.wrapAstTypeWithModifiers(typeValue, variable.type)

    const hasDefaultValue = variable.defaultValue != null && typeof variable.defaultValue !== "undefined"
    const isNonNullType = variable.type.kind === Kind.NON_NULL_TYPE
    const isListType = variable.type.kind === Kind.LIST_TYPE

    const formattedFieldString = this.formatFieldString(fieldName, isNonNullType, isListType, hasDefaultValue)
    const formattedTypeString = this.formatTypeString(fieldType, isNonNullType, isListType, hasDefaultValue)

    // graphql typescript defs failed here, should have been TypeNode = Named or List or NonNull
    const graphqlType = typeFromAST(this._schema, <NamedTypeNode>variable.type)
    const wrapper = mk_type_wrapper_thunk(graphqlType, undefWrapperOptions)
    const pltype = new PLType(fieldType)

    return {
      name: formattedFieldString,
      type: pltype,
      wrapper,
      defaultValue: isNonNullType ? undefined : undefWrapperOptions.mkOptZero(pltype.name),
    }
  }

  protected formatFieldString(
    fieldName: string,
    isNonNullType: boolean,
    isListType: boolean,
    hasDefaultValue: boolean
  ): string {
    return fieldName
  }

  /** Always use js.UndefOr for operation variables.
   * If can be "missing" which is what isNonNullType means here,
   */
  protected formatTypeString(
    fieldType: string,
    isNonNullType: boolean,
    isListType: boolean,
    hasDefaultValue: boolean
  ): string {
    return isListType ? `js.Array[${fieldType}]` : fieldType
  }
}

export default OperationVariablesToObject
