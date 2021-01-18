import { SplootNode } from "../language/node";
import { NodeLayout, LayoutComponent, LayoutComponentType } from "../language/type_registry";
import { NodeObserver } from "../language/observers";
import { NodeMutation } from "../language/mutations/node_mutations";
import { observable } from "mobx";
import { NodeSelection } from "../context/selection";
import { SPLOOT_EXPRESSION } from "../language/types/expression";
import { RenderedChildSetBlock, stringWidth } from "./rendered_childset_block";
import { getColour } from "./colors";

export const NODE_INLINE_SPACING = 8;
export const NODE_BLOCK_HEIGHT = 30;
const INDENT = 30;

export class RenderedParentRef {
  node: NodeBlock;
  childSetId: string;

  constructor(node: NodeBlock, childSetId: string) {
    this.node = node;
    this.childSetId = childSetId;
  }
}

export class RenderedInlineComponent {
  layoutComponent: LayoutComponent;
  width: number;

  constructor(layoutComponent: LayoutComponent, width: number) {
    this.layoutComponent = layoutComponent;
    this.width = width;
  }
}

// Watches node.
export class NodeBlock implements NodeObserver {
  node: SplootNode;
  selection: NodeSelection;
  index: number;
  @observable
  layout: NodeLayout;
  textColor: string;

  @observable
  renderedInlineComponents: RenderedInlineComponent[];
  @observable
  renderedChildSets: {[key: string]: RenderedChildSetBlock}
  @observable
  rightAttachedChildSet: string;
  @observable
  leftBreadcrumbChildSet: string;
  @observable
  isInlineChild: boolean;

  @observable
  x: number;
  @observable
  y: number;
  @observable
  rowHeight: number;
  @observable
  rowWidth: number;
  @observable
  blockWidth: number;
  @observable
  indentedBlockHeight: number;
  @observable
  marginLeft: number;

  constructor(node: SplootNode, selection: NodeSelection, index: number, isInlineChild: boolean) {
    this.selection = selection;
    this.index = index;
    this.renderedChildSets = {};
    this.layout = node.getNodeLayout();
    this.textColor = getColour(this.layout.color)
    this.node = node;
    if (selection) {
      // Using selection as a proxy for whether this is a real node or a autcomplete
      this.node.registerObserver(this);
    }
    this.renderedInlineComponents = [];
    this.isInlineChild = isInlineChild;
    this.blockWidth = 0;
    this.marginLeft = 0;

    this.rowHeight = NODE_BLOCK_HEIGHT;
    this.indentedBlockHeight = 0;
    this.rightAttachedChildSet = null;
    this.leftBreadcrumbChildSet = null;

    let numComponents = this.layout.components.length;

    this.layout.components.forEach((component: LayoutComponent, idx: number) => {
      let isLastInlineComponent = !this.isInlineChild && ((idx === numComponents - 1) || (idx === numComponents - 2)
          && this.layout.components[numComponents - 1].type === LayoutComponentType.CHILD_SET_BLOCK)
      if (component.type === LayoutComponentType.CHILD_SET_BLOCK
          || component.type === LayoutComponentType.CHILD_SET_TREE
          || component.type === LayoutComponentType.CHILD_SET_INLINE
          || component.type === LayoutComponentType.CHILD_SET_TOKEN_LIST
          || component.type === LayoutComponentType.CHILD_SET_ATTACH_RIGHT_EXPRESSION
          || component.type === LayoutComponentType.CHILD_SET_BREADCRUMBS) {
        let childSet = node.getChildSet(component.identifier)
        let childSetParentRef = new RenderedParentRef(this, component.identifier);
        let renderedChildSet = new RenderedChildSetBlock(childSetParentRef, selection, childSet, component, isLastInlineComponent);
        this.renderedChildSets[component.identifier] = renderedChildSet;
        if (component.type === LayoutComponentType.CHILD_SET_ATTACH_RIGHT_EXPRESSION) {
            this.rightAttachedChildSet = component.identifier;
        }
        if (component.type === LayoutComponentType.CHILD_SET_BREADCRUMBS) {
          this.leftBreadcrumbChildSet = component.identifier;
        }
      }
    });

    if (node.type === SPLOOT_EXPRESSION) {
      this.blockWidth = this.renderedChildSets['tokens'].width;
      let childSetBlock = this.renderedChildSets['tokens'];
      this.rowHeight = Math.max(this.rowHeight, childSetBlock.height);
    }
  }

  calculateDimensions(x: number, y: number, selection: NodeSelection) {
    this.x = x;
    this.y = y;
    this.blockWidth = NODE_INLINE_SPACING + 2;
    this.rowHeight = NODE_BLOCK_HEIGHT;
    this.indentedBlockHeight = 0;
    this.renderedInlineComponents = []; // TODO: Find a way to avoid recreating this every time.

    let leftPos = this.x + NODE_INLINE_SPACING;
    let marginRight = 0;
    this.marginLeft = 0;
    let numComponents = this.layout.components.length;
    this.layout.components.forEach((component: LayoutComponent, idx) => {
      let isLastInlineComponent = !this.isInlineChild && ((idx === numComponents - 1) || (idx === numComponents - 2)
          && this.layout.components[numComponents - 1].type === LayoutComponentType.CHILD_SET_BLOCK)
      if (component.type === LayoutComponentType.CHILD_SET_BLOCK) {
        let childSetBlock = this.renderedChildSets[component.identifier];
        childSetBlock.calculateDimensions(x + INDENT, y + this.rowHeight, selection);
        this.indentedBlockHeight += childSetBlock.height;
      }
      else if (component.type === LayoutComponentType.STRING_LITERAL) {
        let val = this.node.getProperty(component.identifier)
        let width = stringWidth('""' + val) + NODE_INLINE_SPACING;
        this.blockWidth += width;
        leftPos += width;
        this.renderedInlineComponents.push(new RenderedInlineComponent(component, width))
      }
      else if (component.type === LayoutComponentType.PROPERTY) {
        let val = this.node.getProperty(component.identifier)
        let width =  stringWidth(val.toString()) + NODE_INLINE_SPACING;
        this.blockWidth += width;
        leftPos += width;
        this.renderedInlineComponents.push(new RenderedInlineComponent(component, width));
      }
      else if (component.type === LayoutComponentType.CHILD_SET_TREE) {
        let childSetBlock = this.renderedChildSets[component.identifier];
        childSetBlock.calculateDimensions(leftPos, y, selection);
        let width = 20;
        this.blockWidth += width;
        leftPos += width;
        this.renderedInlineComponents.push(new RenderedInlineComponent(component, width));

        if (isLastInlineComponent) {
          this.rowHeight = Math.max(this.rowHeight, childSetBlock.height);
          // This minux 16 here accounts for the distance from the dot to the edge of the node.
          // This is dumb tbh.
          marginRight += Math.max(childSetBlock.width - 16, 0);
        } else {
          this.rowHeight = Math.max(this.rowHeight, childSetBlock.height);
        }
      }
      else if (component.type === LayoutComponentType.CHILD_SET_INLINE) {
        let childSetBlock = this.renderedChildSets[component.identifier];
        childSetBlock.calculateDimensions(leftPos, y, selection);
        let width = childSetBlock.width + NODE_INLINE_SPACING;
        leftPos += width;
        this.renderedInlineComponents.push(new RenderedInlineComponent(component, width));
        this.blockWidth += width;
        this.rowHeight = Math.max(this.rowHeight, childSetBlock.height);
      }
      else if (component.type === LayoutComponentType.CHILD_SET_BREADCRUMBS) {
        let childSetBlock = this.renderedChildSets[component.identifier];
        childSetBlock.calculateDimensions(x, y, selection);
        this.marginLeft += childSetBlock.width;
        leftPos += childSetBlock.width;
      }
      else if (component.type === LayoutComponentType.CHILD_SET_ATTACH_RIGHT_EXPRESSION) {
        let childSetBlock = this.renderedChildSets[component.identifier];
        childSetBlock.calculateDimensions(leftPos + 2, y, selection);
        this.rowHeight = Math.max(this.rowHeight, childSetBlock.height);
        marginRight += childSetBlock.width;
      }
      else {
        let width = stringWidth(component.identifier) + NODE_INLINE_SPACING;
        leftPos += width;
        this.blockWidth += width;
        this.renderedInlineComponents.push(new RenderedInlineComponent(component, width));
      }            
    });

    if (this.node.type === SPLOOT_EXPRESSION) {
      let childSetBlock = this.renderedChildSets['tokens'];
      childSetBlock.calculateDimensions(x, y, selection);
      marginRight = this.renderedChildSets['tokens'].width;
      this.blockWidth = 0;
      this.rowHeight = Math.max(this.rowHeight, childSetBlock.height);
    }
    this.rowWidth = this.marginLeft + this.blockWidth + marginRight;
  }

  handleNodeMutation(nodeMutation: NodeMutation): void {
    console.log('Mutation recieved');
  }
}