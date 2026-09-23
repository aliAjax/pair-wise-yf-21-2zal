/**
 * 本地 React 类型垫片：不新增任何 npm 依赖（脚手架未带 @types/react）。
 * 仅声明本项目实际用到的 API，业务代码类型不受影响。
 * 本文件刻意保持“脚本式”声明（无顶层 import/export），
 * 这样 declare module 才是 ambient 模块声明而非模块增强。
 */

declare module "react" {
  type SetStateAction<T> = T | ((prev: T) => T);
  type Dispatch<A> = (value: A) => void;

  export function useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
  export function useState<T = undefined>(): [
    T | undefined,
    Dispatch<SetStateAction<T | undefined>>,
  ];

  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;

  export function useCallback<T extends (...args: never[]) => unknown>(
    callback: T,
    deps: readonly unknown[],
  ): T;

  export interface ChangeEvent<T = Element> {
    target: T;
    currentTarget: T;
  }

  export const StrictMode: (props: { children?: unknown }) => JSX.Element;

  const React: {
    StrictMode: typeof StrictMode;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: unknown, key?: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown, key?: unknown): JSX.Element;
}

declare module "react-dom/client" {
  export interface Root {
    render(node: unknown): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare namespace JSX {
  interface Element {}
  interface ElementClass {
    render(): unknown;
  }
  interface ElementAttributesProperty {
    props: Record<string, unknown>;
  }
  interface ElementChildrenAttribute {
    children: Record<string, unknown>;
  }
  interface IntrinsicElements {
    [elem: string]: unknown;
  }
}
