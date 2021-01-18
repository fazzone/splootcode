import { ASTNode } from "ast-types";
import { ChildSetType } from "../childset";
import { ParentReference, SplootNode } from "../node";
import { NodeCategory, SuggestionGenerator, registerNodeCateogry } from "../node_category_registry";
import { SuggestedNode } from "../suggested_node";
import { LayoutComponent, LayoutComponentType, NodeLayout, registerType, SerializedNode, TypeRegistration } from "../type_registry";
import { SPLOOT_EXPRESSION } from "./expression";
import { ExpressionKind, StatementKind } from "ast-types/gen/kinds";

import * as recast from "recast";
import { HighlightColorCategory } from "../../layout/colors";

export const HTML_SCRIPT_ElEMENT = 'HTML_SCRIPT_ELEMENT';

class Generator implements SuggestionGenerator {

  staticSuggestions(parent: ParentReference, index: number) : SuggestedNode[] {
    return [];
  };

  dynamicSuggestions(parent: ParentReference, index: number, textInput: string) : SuggestedNode[] {
    return [];
  };
}

export class SplootHtmlScriptElement extends SplootNode {
  constructor(parentReference: ParentReference) {
    super(parentReference, HTML_SCRIPT_ElEMENT);
    this.addChildSet('attributes', ChildSetType.Many, NodeCategory.AttributeNode);
    this.addChildSet('content', ChildSetType.Many, NodeCategory.Statement);
  }

  getAttributes() {
    return this.getChildSet('attributes');
  }

  getContent() {
    return this.getChildSet('content');
  }

  generateJsAst() : ASTNode {
    let statements = [];
    this.getContent().children.forEach((node : SplootNode) => {
      let result = null;
      if (node.type === SPLOOT_EXPRESSION) {
        let expressionNode = node.generateJsAst() as ExpressionKind;
        if (expressionNode !== null) {
          result = recast.types.builders.expressionStatement(expressionNode);
        }
      } else {
        result = node.generateJsAst() as StatementKind;
      }
      if (result !== null) {
        statements.push(result);
      }
    });
    return recast.types.builders.program(statements);    
  }

  static deserializer(serializedNode: SerializedNode) : SplootHtmlScriptElement {
    let doc = new SplootHtmlScriptElement(null);
    doc.deserializeChildSet('attributes', serializedNode);
    doc.deserializeChildSet('content', serializedNode);
    return doc;
  }

  static register() {
    let typeRegistration = new TypeRegistration();
    typeRegistration.typeName = HTML_SCRIPT_ElEMENT;
    typeRegistration.deserializer = SplootHtmlScriptElement.deserializer;
    typeRegistration.childSets = {
      'attributes': NodeCategory.AttributeNode,
      'content': NodeCategory.DomNode,
    };
    typeRegistration.layout = new NodeLayout(HighlightColorCategory.HTML_ELEMENT, [
      new LayoutComponent(LayoutComponentType.KEYWORD, 'script'),
      new LayoutComponent(LayoutComponentType.CHILD_SET_TREE, 'attributes'),
      new LayoutComponent(LayoutComponentType.CHILD_SET_BLOCK, 'content'),
    ]);

    registerType(typeRegistration);
    registerNodeCateogry(HTML_SCRIPT_ElEMENT, NodeCategory.DomNode, new Generator());
  }
}