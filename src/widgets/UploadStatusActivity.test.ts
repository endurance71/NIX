import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import * as ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';
import type { UploadLiveActivityProps } from '../lib/uploadLiveActivityPresentation';

type Element = { type: string; props: { children?: Node; [key: string]: unknown } };
type Node = Element | Node[] | string | number | null | boolean | undefined;
type Layout = Record<string, Element>;

// Execute only the serialized widget function, without module-level code.
// SwiftUI is represented by element names; modifiers retain their arguments.
const source = readFileSync(new URL('./UploadStatusActivity.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile(
  'widget.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declaration = ast.statements
  .flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
  )
  .find((item) => item.name.getText(ast) === 'UploadStatusActivity');
if (!declaration?.initializer) throw new Error('Missing serialized widget');
const widgetCode = ts.transpileModule(
  `const render = ${declaration.initializer.getText(ast)}; globalThis.renderWidget = render;`,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const context = createContext({
  exports: {},
  ...Object.fromEntries(
    ['HStack', 'Image', 'ProgressView', 'Spacer', 'Text', 'VStack'].map((name) => [name, name]),
  ),
  ...Object.fromEntries(
    [
      'activityBackgroundTint',
      'aspectRatio',
      'contentTransition',
      'font',
      'foregroundStyle',
      'frame',
      'monospacedDigit',
      'padding',
      'progressViewStyle',
      'resizable',
      'tint',
      'widgetURL',
    ].map((name) => [name, (...args: unknown[]) => ({ name, args })]),
  ),
  require: (name: string) => {
    if (name !== 'react/jsx-runtime') throw new Error(`Unexpected widget dependency: ${name}`);
    return jsxRuntime;
  },
});
runInContext(widgetCode, context);
const render = context.renderWidget as (
  props: UploadLiveActivityProps,
  environment: object,
) => Layout;

function elements(node: Node): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object') return [];
  return [node, ...elements(node.props.children)];
}
function texts(node: Node): string[] {
  return elements(node)
    .filter((item) => item.type === 'Text')
    .map((item) => String(item.props.children));
}
function layout(
  phase: UploadLiveActivityProps['phase'],
  locale: 'pl' | 'en',
  progress = 0.3,
  remainingCount = 3,
) {
  return render({ phase, locale, progress, remainingCount, updatedAt: 123 }, {});
}

describe('isolated UploadStatusActivity layouts', () => {
  const cases = [
    [
      'preparing',
      'Przygotowywanie NiX',
      'Preparing NiX',
      'Optymalizowanie pliku',
      'Optimizing file',
      true,
    ],
    ['uploading', 'Wysyłanie NiX', 'Sending NiX', 'Pozostało: 3', 'Remaining: 3', true],
    [
      'waiting_network',
      'Czeka na sieć',
      'Waiting for network',
      'Wznowimy po połączeniu z siecią',
      'Will resume when connected',
      true,
    ],
    [
      'paused',
      'Wysyłka wstrzymana',
      'Upload paused',
      'Otwórz Skrzynkę, aby wznowić',
      'Open Inbox to resume',
      false,
    ],
    [
      'finalizing',
      'Finalizowanie wysyłki',
      'Finalizing upload',
      'Jeszcze chwila',
      'Almost done',
      true,
    ],
    ['completed', 'Wysłano', 'Sent', 'NiX został wysłany', 'NiX was sent', false],
    [
      'failed',
      'Błąd wysyłania',
      'Upload failed',
      'Stuknij, aby spróbować ponownie',
      'Tap to try again',
      false,
    ],
  ] as const;
  for (const [phase, plTitle, enTitle, plSubtitle, enSubtitle, showProgress] of cases) {
    for (const locale of ['pl', 'en'] as const) {
      it(`${phase} in ${locale} renders the title, subtitle and correct progress regions`, () => {
        const result = layout(phase, locale);
        expect(texts(result.banner)).toContain(locale === 'pl' ? plTitle : enTitle);
        expect(texts(result.expandedBottom)).toContain(locale === 'pl' ? plSubtitle : enSubtitle);
        const bottomProgress = elements(result.expandedBottom).find(
          (item) => item.type === 'ProgressView',
        );
        expect(Boolean(bottomProgress)).toBe(showProgress);
        if (bottomProgress)
          expect(bottomProgress.props.value).toBe(phase === 'preparing' ? null : 0.3);
        expect(result.minimal.type).toBe(
          ['completed', 'failed', 'waiting_network', 'paused'].includes(phase)
            ? 'Image'
            : 'ProgressView',
        );
        expect(result.compactLeading).toBe(result.minimal);
      });
    }
  }
  it('clamps percentages and renders single-upload copy', () => {
    expect(texts(layout('uploading', 'en', 2).compactTrailing)).toEqual(['100%']);
    expect(texts(layout('uploading', 'en', -1).expandedTrailing)).toEqual(['0%']);
    expect(texts(layout('uploading', 'pl', 0.3, 1).expandedBottom)).toContain(
      'Wysyłanie bezpiecznie w tle',
    );
    expect(texts(layout('uploading', 'en', 0.3, 1).expandedBottom)).toContain(
      'Sending securely in the background',
    );
  });
  it('keeps actionable status labels separate from numeric progress', () => {
    expect(texts(layout('failed', 'pl').compactTrailing)).toEqual(['Błąd']);
    expect(texts(layout('waiting_network', 'en').expandedTrailing)).toEqual(['Offline']);
    expect(texts(layout('paused', 'en').compactTrailing)).toEqual(['Paused']);
    expect(texts(layout('completed', 'en', 1).compactTrailing)).toEqual(['100%']);
  });
});
