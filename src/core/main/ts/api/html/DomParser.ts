/**
 * DomParser.js
 *
 * Released under LGPL License.
 * Copyright (c) 1999-2017 Ephox Corp. All rights reserved
 *
 * License: http://www.tinymce.com/license
 * Contributing: http://www.tinymce.com/contributing
 */

import LegacyFilter from '../../html/LegacyFilter';
import Node from './Node';
import SaxParser from './SaxParser';
import Schema from './Schema';
import Tools from '../util/Tools';

export type ParserArgs = any;
export type ParserFilterCallback = (nodes: Node[], name: string, args: ParserArgs) => void;

export interface ParserFilter {
  name: string;
  callbacks: ParserFilterCallback[];
}

/**
 * This class parses HTML code into a DOM like structure of nodes it will remove redundant whitespace and make
 * sure that the node tree is valid according to the specified schema.
 * So for example: <p>a<p>b</p>c</p> will become <p>a</p><p>b</p><p>c</p>
 *
 * @example
 * var parser = new tinymce.html.DomParser({validate: true}, schema);
 * var rootNode = parser.parse('<h1>content</h1>');
 *
 * @class tinymce.html.DomParser
 * @version 3.4
 */

const makeMap = Tools.makeMap, each = Tools.each, explode = Tools.explode, extend = Tools.extend;

const paddEmptyNode = function (settings, args, blockElements, node) {
  const brPreferred = settings.padd_empty_with_br || args.insert;

  if (brPreferred && blockElements[node.name]) {
    node.empty().append(new Node('br', 1)).shortEnded = true;
  } else {
    node.empty().append(new Node('#text', 3)).value = '\u00a0';
  }
};

const isPaddedWithNbsp = function (node) {
  return hasOnlyChild(node, '#text') && node.firstChild.value === '\u00a0';
};

const hasOnlyChild = function (node, name) {
  return node && node.firstChild && node.firstChild === node.lastChild && node.firstChild.name === name;
};

const isPadded = function (schema, node) {
  const rule = schema.getElementRule(node.name);
  return rule && rule.paddEmpty;
};

const isEmpty = function (schema, nonEmptyElements, whitespaceElements, node) {
  return node.isEmpty(nonEmptyElements, whitespaceElements, function (node) {
    return isPadded(schema, node);
  });
};

const isLineBreakNode = (node, blockElements) => node && (blockElements[node.name] || node.name === 'br');

export default function (settings?, schema = Schema()) {
  const nodeFilters = {};
  const attributeFilters = [];
  let matchedNodes = {};
  let matchedAttributes = {};

  settings = settings || {};
  settings.validate = 'validate' in settings ? settings.validate : true;
  settings.root_name = settings.root_name || 'body';

  const fixInvalidChildren = function (nodes) {
    let ni, node, parent, parents, newParent, currentNode, tempNode, childNode, i;
    let nonEmptyElements, whitespaceElements, nonSplitableElements, textBlockElements, specialElements, sibling, nextNode;

    nonSplitableElements = makeMap('tr,td,th,tbody,thead,tfoot,table');
    nonEmptyElements = schema.getNonEmptyElements();
    whitespaceElements = schema.getWhiteSpaceElements();
    textBlockElements = schema.getTextBlockElements();
    specialElements = schema.getSpecialElements();

    for (ni = 0; ni < nodes.length; ni++) {
      node = nodes[ni];

      // Already removed or fixed
      if (!node.parent || node.fixed) {
        continue;
      }

      // If the invalid element is a text block and the text block is within a parent LI element
      // Then unwrap the first text block and convert other sibling text blocks to LI elements similar to Word/Open Office
      if (textBlockElements[node.name] && node.parent.name === 'li') {
        // Move sibling text blocks after LI element
        sibling = node.next;
        while (sibling) {
          if (textBlockElements[sibling.name]) {
            sibling.name = 'li';
            sibling.fixed = true;
            node.parent.insert(sibling, node.parent);
          } else {
            break;
          }

          sibling = sibling.next;
        }

        // Unwrap current text block
        node.unwrap(node);
        continue;
      }

      // Get list of all parent nodes until we find a valid parent to stick the child into
      parents = [node];
      for (parent = node.parent; parent && !schema.isValidChild(parent.name, node.name) &&
        !nonSplitableElements[parent.name]; parent = parent.parent) {
        parents.push(parent);
      }

      // Found a suitable parent
      if (parent && parents.length > 1) {
        // Reverse the array since it makes looping easier
        parents.reverse();

        // Clone the related parent and insert that after the moved node
        newParent = currentNode = filterNode(parents[0].clone());

        // Start cloning and moving children on the left side of the target node
        for (i = 0; i < parents.length - 1; i++) {
          if (schema.isValidChild(currentNode.name, parents[i].name)) {
            tempNode = filterNode(parents[i].clone());
            currentNode.append(tempNode);
          } else {
            tempNode = currentNode;
          }

          for (childNode = parents[i].firstChild; childNode && childNode !== parents[i + 1];) {
            nextNode = childNode.next;
            tempNode.append(childNode);
            childNode = nextNode;
          }

          currentNode = tempNode;
        }

        if (!isEmpty(schema, nonEmptyElements, whitespaceElements, newParent)) {
          parent.insert(newParent, parents[0], true);
          parent.insert(node, newParent);
        } else {
          parent.insert(node, parents[0], true);
        }

        // Check if the element is empty by looking through it's contents and special treatment for <p><br /></p>
        parent = parents[0];
        if (isEmpty(schema, nonEmptyElements, whitespaceElements, parent) || hasOnlyChild(parent, 'br')) {
          parent.empty().remove();
        }
      } else if (node.parent) {
        // If it's an LI try to find a UL/OL for it or wrap it
        if (node.name === 'li') {
          sibling = node.prev;
          if (sibling && (sibling.name === 'ul' || sibling.name === 'ul')) {
            sibling.append(node);
            continue;
          }

          sibling = node.next;
          if (sibling && (sibling.name === 'ul' || sibling.name === 'ul')) {
            sibling.insert(node, sibling.firstChild, true);
            continue;
          }

          node.wrap(filterNode(new Node('ul', 1)));
          continue;
        }

        // Try wrapping the element in a DIV
        if (schema.isValidChild(node.parent.name, 'div') && schema.isValidChild('div', node.name)) {
          node.wrap(filterNode(new Node('div', 1)));
        } else {
          // We failed wrapping it, then remove or unwrap it
          if (specialElements[node.name]) {
            node.empty().remove();
          } else {
            node.unwrap();
          }
        }
      }
    }
  };

  /**
   * Runs the specified node though the element and attributes filters.
   *
   * @method filterNode
   * @param {tinymce.html.Node} Node the node to run filters on.
   * @return {tinymce.html.Node} The passed in node.
   */
  const filterNode = (node: Node): Node => {
    let i, name, list;

    // Run element filters
    if (name in nodeFilters) {
      list = matchedNodes[name];

      if (list) {
        list.push(node);
      } else {
        matchedNodes[name] = [node];
      }
    }

    // Run attribute filters
    i = attributeFilters.length;
    while (i--) {
      name = attributeFilters[i].name;

      if (name in node.attributes.map) {
        list = matchedAttributes[name];

        if (list) {
          list.push(node);
        } else {
          matchedAttributes[name] = [node];
        }
      }
    }

    return node;
  };

  /**
   * Adds a node filter function to the parser, the parser will collect the specified nodes by name
   * and then execute the callback ones it has finished parsing the document.
   *
   * @example
   * parser.addNodeFilter('p,h1', function(nodes, name) {
   *  for (var i = 0; i < nodes.length; i++) {
   *   console.log(nodes[i].name);
   *  }
   * });
   * @method addNodeFilter
   * @method {String} name Comma separated list of nodes to collect.
   * @param {function} callback Callback function to execute once it has collected nodes.
   */
  const addNodeFilter = (name: string, callback: (nodes: Node[], name: string, args: ParserArgs) => void) => {
    each(explode(name), function (name) {
      let list = nodeFilters[name];

      if (!list) {
        nodeFilters[name] = list = [];
      }

      list.push(callback);
    });
  };

  const getNodeFilters = (): ParserFilter[] => {
    const out = [];

    for (const name in nodeFilters) {
      if (nodeFilters.hasOwnProperty(name)) {
        out.push({ name, callbacks: nodeFilters[name] });
      }
    }

    return out;
  };

  /**
   * Adds a attribute filter function to the parser, the parser will collect nodes that has the specified attributes
   * and then execute the callback ones it has finished parsing the document.
   *
   * @example
   * parser.addAttributeFilter('src,href', function(nodes, name) {
   *  for (var i = 0; i < nodes.length; i++) {
   *   console.log(nodes[i].name);
   *  }
   * });
   * @method addAttributeFilter
   * @method {String} name Comma separated list of nodes to collect.
   * @param {function} callback Callback function to execute once it has collected nodes.
   */
  const addAttributeFilter = (name: string, callback: (nodes: Node[], name: string, args: ParserArgs) => void) => {
    each(explode(name), function (name) {
      let i;

      for (i = 0; i < attributeFilters.length; i++) {
        if (attributeFilters[i].name === name) {
          attributeFilters[i].callbacks.push(callback);
          return;
        }
      }

      attributeFilters.push({ name, callbacks: [callback] });
    });
  };

  const getAttributeFilters = (): ParserFilter[] => [].concat(attributeFilters);

  /**
   * Parses the specified HTML string into a DOM like node tree and returns the result.
   *
   * @example
   * var rootNode = new DomParser({...}).parse('<b>text</b>');
   * @method parse
   * @param {String} html Html string to sax parse.
   * @param {Object} args Optional args object that gets passed to all filter functions.
   * @return {tinymce.html.Node} Root node containing the tree.
   */
  const parse = (html: string, args?: ParserArgs): Node => {
    let parser, nodes, i, l, fi, fl, list, name;
    let blockElements;
    const invalidChildren = [];
    let isInWhiteSpacePreservedElement;
    let node: Node;

    args = args || {};
    matchedNodes = {};
    matchedAttributes = {};
    blockElements = extend(makeMap('script,style,head,html,body,title,meta,param'), schema.getBlockElements());
    const nonEmptyElements = schema.getNonEmptyElements();
    const children = schema.children;
    const validate = settings.validate;
    const rootBlockName = 'forced_root_block' in args ? args.forced_root_block : settings.forced_root_block;
    const whiteSpaceElements = schema.getWhiteSpaceElements();
    const startWhiteSpaceRegExp = /^[ \t\r\n]+/;
    const endWhiteSpaceRegExp = /[ \t\r\n]+$/;
    const allWhiteSpaceRegExp = /[ \t\r\n]+/g;
    const isAllWhiteSpaceRegExp = /^[ \t\r\n]+$/;

    const addRootBlocks = function () {
      let node = rootNode.firstChild, next, rootBlockNode;

      // Removes whitespace at beginning and end of block so:
      // <p> x </p> -> <p>x</p>
      const trim = function (rootBlockNode) {
        if (rootBlockNode) {
          node = rootBlockNode.firstChild;
          if (node && node.type === 3) {
            node.value = node.value.replace(startWhiteSpaceRegExp, '');
          }

          node = rootBlockNode.lastChild;
          if (node && node.type === 3) {
            node.value = node.value.replace(endWhiteSpaceRegExp, '');
          }
        }
      };

      // Check if rootBlock is valid within rootNode for example if P is valid in H1 if H1 is the contentEditabe root
      if (!schema.isValidChild(rootNode.name, rootBlockName.toLowerCase())) {
        return;
      }

      while (node) {
        next = node.next;

        if (node.type === 3 || (node.type === 1 && node.name !== 'p' &&
          !blockElements[node.name] && !node.attr('data-mce-type'))) {
          if (!rootBlockNode) {
            // Create a new root block element
            rootBlockNode = createNode(rootBlockName, 1);
            rootBlockNode.attr(settings.forced_root_block_attrs);
            rootNode.insert(rootBlockNode, node);
            rootBlockNode.append(node);
          } else {
            rootBlockNode.append(node);
          }
        } else {
          trim(rootBlockNode);
          rootBlockNode = null;
        }

        node = next;
      }

      trim(rootBlockNode);
    };

    const createNode = function (name, type) {
      const node = new Node(name, type);
      let list;

      if (name in nodeFilters) {
        list = matchedNodes[name];

        if (list) {
          list.push(node);
        } else {
          matchedNodes[name] = [node];
        }
      }

      return node;
    };

    const removeWhitespaceBefore = function (node) {
      let textNode, textNodeNext, textVal, sibling;
      const blockElements = schema.getBlockElements();

      for (textNode = node.prev; textNode && textNode.type === 3;) {
        textVal = textNode.value.replace(endWhiteSpaceRegExp, '');

        // Found a text node with non whitespace then trim that and break
        if (textVal.length > 0) {
          textNode.value = textVal;
          return;
        }

        textNodeNext = textNode.next;

        // Fix for bug #7543 where bogus nodes would produce empty
        // text nodes and these would be removed if a nested list was before it
        if (textNodeNext) {
          if (textNodeNext.type === 3 && textNodeNext.value.length) {
            textNode = textNode.prev;
            continue;
          }

          if (!blockElements[textNodeNext.name] && textNodeNext.name !== 'script' && textNodeNext.name !== 'style') {
            textNode = textNode.prev;
            continue;
          }
        }

        sibling = textNode.prev;
        textNode.remove();
        textNode = sibling;
      }
    };

    const cloneAndExcludeBlocks = function (input) {
      let name;
      const output = {};

      for (name in input) {
        if (name !== 'li' && name !== 'p') {
          output[name] = input[name];
        }
      }

      return output;
    };

    parser = SaxParser({
      validate,
      allow_script_urls: settings.allow_script_urls,
      allow_conditional_comments: settings.allow_conditional_comments,

      // Exclude P and LI from DOM parsing since it's treated better by the DOM parser
      self_closing_elements: cloneAndExcludeBlocks(schema.getSelfClosingElements()),

      cdata (text) {
        node.append(createNode('#cdata', 4)).value = text;
      },

      text (text, raw) {
        let textNode;

        // Trim all redundant whitespace on non white space elements
        if (!isInWhiteSpacePreservedElement) {
          text = text.replace(allWhiteSpaceRegExp, ' ');

          if (isLineBreakNode(node.lastChild, blockElements)) {
            text = text.replace(startWhiteSpaceRegExp, '');
          }
        }

        // Do we need to create the node
        if (text.length !== 0) {
          textNode = createNode('#text', 3);
          textNode.raw = !!raw;
          node.append(textNode).value = text;
        }
      },

      comment (text) {
        node.append(createNode('#comment', 8)).value = text;
      },

      pi (name, text) {
        node.append(createNode(name, 7)).value = text;
        removeWhitespaceBefore(node);
      },

      doctype (text) {
        let newNode;

        newNode = node.append(createNode('#doctype', 10));
        newNode.value = text;
        removeWhitespaceBefore(node);
      },

      start (name, attrs, empty) {
        let newNode, attrFiltersLen, elementRule, attrName, parent;

        elementRule = validate ? schema.getElementRule(name) : {};
        if (elementRule) {
          newNode = createNode(elementRule.outputName || name, 1);
          newNode.attributes = attrs;
          newNode.shortEnded = empty;

          node.append(newNode);

          // Check if node is valid child of the parent node is the child is
          // unknown we don't collect it since it's probably a custom element
          parent = children[node.name];
          if (parent && children[newNode.name] && !parent[newNode.name]) {
            invalidChildren.push(newNode);
          }

          attrFiltersLen = attributeFilters.length;
          while (attrFiltersLen--) {
            attrName = attributeFilters[attrFiltersLen].name;

            if (attrName in attrs.map) {
              list = matchedAttributes[attrName];

              if (list) {
                list.push(newNode);
              } else {
                matchedAttributes[attrName] = [newNode];
              }
            }
          }

          // Trim whitespace before block
          if (blockElements[name]) {
            removeWhitespaceBefore(newNode);
          }

          // Change current node if the element wasn't empty i.e not <br /> or <img />
          if (!empty) {
            node = newNode;
          }

          // Check if we are inside a whitespace preserved element
          if (!isInWhiteSpacePreservedElement && whiteSpaceElements[name]) {
            isInWhiteSpacePreservedElement = true;
          }
        }
      },

      end (name) {
        let textNode, elementRule, text, sibling, tempNode;

        elementRule = validate ? schema.getElementRule(name) : {};
        if (elementRule) {
          if (blockElements[name]) {
            if (!isInWhiteSpacePreservedElement) {
              // Trim whitespace of the first node in a block
              textNode = node.firstChild;
              if (textNode && textNode.type === 3) {
                text = textNode.value.replace(startWhiteSpaceRegExp, '');

                // Any characters left after trim or should we remove it
                if (text.length > 0) {
                  textNode.value = text;
                  textNode = textNode.next;
                } else {
                  sibling = textNode.next;
                  textNode.remove();
                  textNode = sibling;

                  // Remove any pure whitespace siblings
                  while (textNode && textNode.type === 3) {
                    text = textNode.value;
                    sibling = textNode.next;

                    if (text.length === 0 || isAllWhiteSpaceRegExp.test(text)) {
                      textNode.remove();
                      textNode = sibling;
                    }

                    textNode = sibling;
                  }
                }
              }

              // Trim whitespace of the last node in a block
              textNode = node.lastChild;
              if (textNode && textNode.type === 3) {
                text = textNode.value.replace(endWhiteSpaceRegExp, '');

                // Any characters left after trim or should we remove it
                if (text.length > 0) {
                  textNode.value = text;
                  textNode = textNode.prev;
                } else {
                  sibling = textNode.prev;
                  textNode.remove();
                  textNode = sibling;

                  // Remove any pure whitespace siblings
                  while (textNode && textNode.type === 3) {
                    text = textNode.value;
                    sibling = textNode.prev;

                    if (text.length === 0 || isAllWhiteSpaceRegExp.test(text)) {
                      textNode.remove();
                      textNode = sibling;
                    }

                    textNode = sibling;
                  }
                }
              }
            }

            // Trim start white space
            // Removed due to: #5424
            /*textNode = node.prev;
            if (textNode && textNode.type === 3) {
              text = textNode.value.replace(startWhiteSpaceRegExp, '');

              if (text.length > 0)
                textNode.value = text;
              else
                textNode.remove();
            }*/
          }

          // Check if we exited a whitespace preserved element
          if (isInWhiteSpacePreservedElement && whiteSpaceElements[name]) {
            isInWhiteSpacePreservedElement = false;
          }

          if (elementRule.removeEmpty && isEmpty(schema, nonEmptyElements, whiteSpaceElements, node)) {
            // Leave nodes that have a name like <a name="name">
            if (!node.attributes.map.name && !node.attr('id')) {
              tempNode = node.parent;

              if (blockElements[node.name]) {
                node.empty().remove();
              } else {
                node.unwrap();
              }

              node = tempNode;
              return;
            }
          }

          if (elementRule.paddEmpty && (isPaddedWithNbsp(node) || isEmpty(schema, nonEmptyElements, whiteSpaceElements, node))) {
            paddEmptyNode(settings, args, blockElements, node);
          }

          node = node.parent;
        }
      }
    }, schema);

    const rootNode = node = new Node(args.context || settings.root_name, 11);

    parser.parse(html);

    // Fix invalid children or report invalid children in a contextual parsing
    if (validate && invalidChildren.length) {
      if (!args.context) {
        fixInvalidChildren(invalidChildren);
      } else {
        args.invalid = true;
      }
    }

    // Wrap nodes in the root into block elements if the root is body
    if (rootBlockName && (rootNode.name === 'body' || args.isRootContent)) {
      addRootBlocks();
    }

    // Run filters only when the contents is valid
    if (!args.invalid) {
      // Run node filters
      for (name in matchedNodes) {
        list = nodeFilters[name];
        nodes = matchedNodes[name];

        // Remove already removed children
        fi = nodes.length;
        while (fi--) {
          if (!nodes[fi].parent) {
            nodes.splice(fi, 1);
          }
        }

        for (i = 0, l = list.length; i < l; i++) {
          list[i](nodes, name, args);
        }
      }

      // Run attribute filters
      for (i = 0, l = attributeFilters.length; i < l; i++) {
        list = attributeFilters[i];

        if (list.name in matchedAttributes) {
          nodes = matchedAttributes[list.name];

          // Remove already removed children
          fi = nodes.length;
          while (fi--) {
            if (!nodes[fi].parent) {
              nodes.splice(fi, 1);
            }
          }

          for (fi = 0, fl = list.callbacks.length; fi < fl; fi++) {
            list.callbacks[fi](nodes, list.name, args);
          }
        }
      }
    }

    return rootNode;
  };

  // Remove <br> at end of block elements Gecko and WebKit injects BR elements to
  // make it possible to place the caret inside empty blocks. This logic tries to remove
  // these elements and keep br elements that where intended to be there intact
  if (settings.remove_trailing_brs) {
    addNodeFilter('br', (nodes, _, args) => {
      let i;
      const l = nodes.length;
      let node;
      const blockElements = extend({}, schema.getBlockElements());
      const nonEmptyElements = schema.getNonEmptyElements();
      let parent, lastParent, prev, prevName;
      const whiteSpaceElements = schema.getNonEmptyElements();
      let elementRule, textNode;

      // Remove brs from body element as well
      blockElements.body = 1;

      // Must loop forwards since it will otherwise remove all brs in <p>a<br><br><br></p>
      for (i = 0; i < l; i++) {
        node = nodes[i];
        parent = node.parent;

        if (blockElements[node.parent.name] && node === parent.lastChild) {
          // Loop all nodes to the left of the current node and check for other BR elements
          // excluding bookmarks since they are invisible
          prev = node.prev;
          while (prev) {
            prevName = prev.name;

            // Ignore bookmarks
            if (prevName !== 'span' || prev.attr('data-mce-type') !== 'bookmark') {
              // Found a non BR element
              if (prevName !== 'br') {
                break;
              }

              // Found another br it's a <br><br> structure then don't remove anything
              if (prevName === 'br') {
                node = null;
                break;
              }
            }

            prev = prev.prev;
          }

          if (node) {
            node.remove();

            // Is the parent to be considered empty after we removed the BR
            if (isEmpty(schema, nonEmptyElements, whiteSpaceElements, parent)) {
              elementRule = schema.getElementRule(parent.name);

              // Remove or padd the element depending on schema rule
              if (elementRule) {
                if (elementRule.removeEmpty) {
                  parent.remove();
                } else if (elementRule.paddEmpty) {
                  paddEmptyNode(settings, args, blockElements, parent);
                }
              }
            }
          }
        } else {
          // Replaces BR elements inside inline elements like <p><b><i><br></i></b></p>
          // so they become <p><b><i>&nbsp;</i></b></p>
          lastParent = node;
          while (parent && parent.firstChild === lastParent && parent.lastChild === lastParent) {
            lastParent = parent;

            if (blockElements[parent.name]) {
              break;
            }

            parent = parent.parent;
          }

          if (lastParent === parent && settings.padd_empty_with_br !== true) {
            textNode = new Node('#text', 3);
            textNode.value = '\u00a0';
            node.replace(textNode);
          }
        }
      }
    });
  }

  addAttributeFilter('href', function (nodes) {
    let i = nodes.length, node;

    const appendRel = function (rel) {
      const parts = rel.split(' ').filter(function (p) {
        return p.length > 0;
      });
      return parts.concat(['noopener']).sort().join(' ');
    };

    const addNoOpener = function (rel) {
      const newRel = rel ? Tools.trim(rel) : '';
      if (!/\b(noopener)\b/g.test(newRel)) {
        return appendRel(newRel);
      } else {
        return newRel;
      }
    };

    if (!settings.allow_unsafe_link_target) {
      while (i--) {
        node = nodes[i];
        if (node.name === 'a' && node.attr('target') === '_blank') {
          node.attr('rel', addNoOpener(node.attr('rel')));
        }
      }
    }
  });

  // Force anchor names closed, unless the setting "allow_html_in_named_anchor" is explicitly included.
  if (!settings.allow_html_in_named_anchor) {
    addAttributeFilter('id,name', function (nodes) {
      let i = nodes.length, sibling, prevSibling, parent, node;

      while (i--) {
        node = nodes[i];
        if (node.name === 'a' && node.firstChild && !node.attr('href')) {
          parent = node.parent;

          // Move children after current node
          sibling = node.lastChild;
          do {
            prevSibling = sibling.prev;
            parent.insert(sibling, node);
            sibling = prevSibling;
          } while (sibling);
        }
      }
    });
  }

  if (settings.fix_list_elements) {
    addNodeFilter('ul,ol', function (nodes) {
      let i = nodes.length, node, parentNode;

      while (i--) {
        node = nodes[i];
        parentNode = node.parent;

        if (parentNode.name === 'ul' || parentNode.name === 'ol') {
          if (node.prev && node.prev.name === 'li') {
            node.prev.append(node);
          } else {
            const li = new Node('li', 1);
            li.attr('style', 'list-style-type: none');
            node.wrap(li);
          }
        }
      }
    });
  }

  if (settings.validate && schema.getValidClasses()) {
    addAttributeFilter('class', function (nodes) {
      let i = nodes.length, node, classList, ci, className, classValue;
      const validClasses = schema.getValidClasses();
      let validClassesMap, valid;

      while (i--) {
        node = nodes[i];
        classList = node.attr('class').split(' ');
        classValue = '';

        for (ci = 0; ci < classList.length; ci++) {
          className = classList[ci];
          valid = false;

          validClassesMap = validClasses['*'];
          if (validClassesMap && validClassesMap[className]) {
            valid = true;
          }

          validClassesMap = validClasses[node.name];
          if (!valid && validClassesMap && validClassesMap[className]) {
            valid = true;
          }

          if (valid) {
            if (classValue) {
              classValue += ' ';
            }

            classValue += className;
          }
        }

        if (!classValue.length) {
          classValue = null;
        }

        node.attr('class', classValue);
      }
    });
  }

  const exports = {
    schema,
    addAttributeFilter,
    getAttributeFilters,
    addNodeFilter,
    getNodeFilters,
    filterNode,
    parse
  };

  LegacyFilter.register(exports, settings);

  return exports;
}