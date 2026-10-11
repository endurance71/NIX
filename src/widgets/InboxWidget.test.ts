import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import * as ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';
import type { InboxWidgetProps } from './InboxWidget';

type Element = { type: string; props: { children?: Node; [key: string]: unknown } };
type Node = Element | Node[] | string | number | null | boolean | undefined;

// Execute only the serialized widget function, the way the widget extension does.
const source = readFileSync(new URL('./InboxWidget.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('widget.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements
  .flatMap((statement) => (ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []))
  .find((item) => item.name.getText(ast) === 'InboxWidget');
if (!declaration?.initializer) throw new Error('Missing serialized widget');
const widgetCode = ts.transpileModule(
  `const render = ${declaration.initializer.getText(ast)}; globalThis.renderWidget = render;`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }
).outputText;
const context = createContext({
  exports: {},
  ...Object.fromEntries(['HStack', 'Image', 'Spacer', 'Text', 'VStack'].map((name) => [name, name])),
  ...Object.fromEntries(
    ['clipShape', 'containerBackground', 'font', 'foregroundStyle', 'frame', 'monospacedDigit', 'resizable', 'widgetURL'].map(
      (name) => [name, (...args: unknown[]) => ({ name, args })]
    )
  ),
  require: (name: string) => {
    if (name !== 'react/jsx-runtime') throw new Error(`Unexpected widget dependency: ${name}`);
    return jsxRuntime;
  },
});
runInContext(widgetCode, context);
const render = context.renderWidget as (props: InboxWidgetProps, environment: object) => Element;

function texts(node: Node): string[] {
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!node || typeof node !== 'object') return [];
  const own = node.type === 'Text' ? [String(node.props.children)] : [];
  return [...own, ...texts(node.props.children)];
}

describe('InboxWidget', () => {
  const small = { widgetFamily: 'systemSmall' };

  it('declines the Polish label like the inbox', () => {
    expect(texts(render({ count: 0, locale: 'pl' }, small))).toEqual(['0', 'Brak nowych NiX-ów']);
    expect(texts(render({ count: 1, locale: 'pl' }, small))).toEqual(['1', 'nowy NiX']);
    expect(texts(render({ count: 3, locale: 'pl' }, small))).toEqual(['3', 'nowe NiX-y']);
    expect(texts(render({ count: 12, locale: 'pl' }, small))).toEqual(['12', 'nowych NiX-ów']);
    expect(texts(render({ count: 22, locale: 'pl' }, small))).toEqual(['22', 'nowe NiX-y']);
  });

  it('uses English copy and caps the number', () => {
    expect(texts(render({ count: 1, locale: 'en' }, small))).toEqual(['1', 'new NiX']);
    expect(texts(render({ count: 250, locale: 'en' }, small))).toEqual(['99+', 'new NiXs']);
  });

  it('has compact Lock Screen layouts', () => {
    expect(texts(render({ count: 4, locale: 'pl' }, { widgetFamily: 'accessoryCircular' }))).toEqual(['4', 'NiX']);
    expect(texts(render({ count: 4, locale: 'pl' }, { widgetFamily: 'accessoryRectangular' }))).toEqual([
      'NiX',
      '4 nowe NiX-y',
    ]);
  });
});
