import * as esbuild from "esbuild-wasm";

const supportedJS = ["js", "javascript"];
const supportedTS = ["ts", "typescript"];
const supportedLanguages = [...supportedJS, ...supportedTS];
function isJavaScript(language: string) {
  return supportedJS.includes(language);
}

function isTypeScript(language: string) {
  return supportedTS.includes(language);
}

export function isRunnable(language: string) {
  return supportedLanguages.includes(language);
}

/**
 * Run JavaScript code in eval() context, to support returning values from simple expressions `1+1`
 * and also support `import * as esbuild from 'https://cdn.skypack.dev/esbuild-wasm@0.19.2'` via ES6 modules fallback
 */
async function runJavascript(code: string) {
  try {
    const fn = new Function(`return eval(${JSON.stringify(code)});`);
    return fn();
  } catch (error: any) {
    const msgLower = error.message.toLowerCase();
    const maybeES6Module =
      error instanceof SyntaxError &&
      // Cannot use import statement outside a module
      // import declarations may only appear at top level of a module
      msgLower.includes("module") &&
      msgLower.includes("import");
    if (maybeES6Module) {
      // check if code has export.*default regexp
      if (!/export\s+default\s+/.test(code)) {
        console.warn(
          "Chatcraft: Evaling code in a module context, must `export default =` at end to return a value"
        );
      }
      const module = await import("data:text/javascript;base64," + btoa(code));
      return module.default;
    } else {
      throw error;
    }
  }
}

let esbuildLoaded = false;

async function compileWithEsbuild(tsCode: string) {
  if (!esbuildLoaded) {
    await esbuild.initialize({
      // no idea how to load the bundled wasm file from esbuild-wasm in vite
      wasmURL: "https://cdn.jsdelivr.net/npm/esbuild-wasm@0.19.2/esbuild.wasm",
    });
    esbuildLoaded = true;
  }
  // Compile TypeScript code
  const js = await esbuild.transform(tsCode, {
    loader: "ts",
  });
  return js.code;
}

export async function runCode(code: string, language: string) {
  if (isTypeScript(language)) {
    code = await compileWithEsbuild(code);
    language = "js";
  }
  if (isJavaScript(language)) {
    return runJavascript(code);
  }
  throw new Error(`Unsupported language: ${language}`);
}