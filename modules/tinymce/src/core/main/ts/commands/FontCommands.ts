/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Arr, Strings } from '@ephox/katamari';
import Editor from '../api/Editor';
import * as Settings from '../api/Settings';
import * as NodeType from '../dom/NodeType';
import * as FontInfo from '../fmt/FontInfo';

const fromFontSizeNumber = (editor: Editor, value: string): string => {
  if (/^[0-9\.]+$/.test(value)) {
    const fontSizeNumber = parseInt(value, 10);

    // Convert font size 1-7 to styles
    if (fontSizeNumber >= 1 && fontSizeNumber <= 7) {
      const fontSizes = Settings.getFontStyleValues(editor);
      const fontClasses = Settings.getFontSizeClasses(editor);

      if (fontClasses) {
        return fontClasses[fontSizeNumber - 1] || value;
      } else {
        return fontSizes[fontSizeNumber - 1] || value;
      }
    } else {
      return value;
    }
  } else {
    return value;
  }
};

const normalizeFontNames = (font: string) => {
  const fonts = font.split(/\s*,\s*/);
  return Arr.map(fonts, (font) => {
    if (font.indexOf(' ') !== -1 && !(Strings.startsWith(font, '"') || Strings.startsWith(font, `'`))) {
      // TINY-3801: The font has spaces, so need to wrap with quotes as the browser sometimes automatically handles this, but not always
      return `'${font}'`;
    } else {
      return font;
    }
  }).join(',');
};

const fontQuery = (editor: Editor, fontProp: FontInfo.FontProp) => {
  const getter = fontProp === 'font-family' ? FontInfo.getFontFamily : FontInfo.getFontSize;
  let rngOrNode: Range | Node = editor.selection.getRng().cloneRange();
  // Have to directly use node instead of rng as rng will not return any results otherwise
  // Note: This occurs with a collapsed selection at the start or end of an element
  if (NodeType.isText(rngOrNode.startContainer) && rngOrNode.startContainer === rngOrNode.endContainer) {
    rngOrNode = rngOrNode.startContainer;
  }
  return getter(editor.getBody(), rngOrNode);
};

export const fontNameAction = (editor: Editor, value: string) => {
  const font = fromFontSizeNumber(editor, value);
  editor.formatter.toggle('fontname', { value: normalizeFontNames(font) });
  editor.nodeChanged();
};

export const fontNameQuery = (editor: Editor) =>
  fontQuery(editor, 'font-family');

export const fontSizeAction = (editor: Editor, value: string) => {
  editor.formatter.toggle('fontsize', { value: fromFontSizeNumber(editor, value) });
  editor.nodeChanged();
};

export const fontSizeQuery = (editor: Editor) =>
  fontQuery(editor, 'font-size');
