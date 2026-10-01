import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const dictionaries = Object.fromEntries(
  ["en", "es"].map((lang) => [
    lang,
    JSON.parse(fs.readFileSync(`lib/locales/${lang}.json`, "utf8")),
  ]),
);
const keys = new Set();
for (const file of fs
  .readdirSync("components")
  .filter((f) => f.endsWith(".tsx"))) {
  const sf = ts.createSourceFile(
    file,
    fs.readFileSync(`components/${file}`, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(n) {
    if (
      ts.isCallExpression(n) &&
      ["translate", "t"].includes(n.expression.getText(sf)) &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0])
    )
      keys.add(n.arguments[0].text.replace(/\s+/g, " ").trim());
    // Translation must never change DOM values, routing, CSS or event-handler data.
    if (
      ts.isJsxAttribute(n) &&
      ["className", "href", "value", "name", "id"].includes(n.name.getText(sf))
    )
      assert.ok(
        !/\btranslate\(/.test(n.getText(sf)),
        `${file}: translated control attribute`,
      );
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
const placeholders = (text) =>
  [...text.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
for (const [language, dictionary] of Object.entries(dictionaries)) {
  for (const key of keys) {
    assert.ok(dictionary[key], `${language}: missing ${key}`);
    assert.deepEqual(
      placeholders(dictionary[key]),
      placeholders(key),
      `${language}: placeholders ${key}`,
    );
    assert.ok(
      !dictionary[key].includes("▁"),
      `${language}: tokenizer artifact`,
    );
  }
  for (const brand of [
    "drive",
    "data",
    "vision",
    "DriveVision",
    "DRIVEVISION",
    "Asaas",
    "R$",
  ])
    assert.equal(dictionary[brand], brand);
}
let source = fs.readFileSync("lib/i18n.ts", "utf8");
for (const lang of ["en", "es"])
  source = source.replace(
    new RegExp(`import ${lang} from [^;]+;`),
    `const ${lang} = ${JSON.stringify(dictionaries[lang])};`,
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const saved = new Map();
globalThis.window = {};
globalThis.document = { documentElement: { lang: "pt-BR" }, title: "" };
globalThis.localStorage = {
  getItem: (key) => saved.get(key),
  setItem: (key, val) => saved.set(key, val),
};
const api = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
assert.equal(api.getLanguage(), "pt-BR");
let changes = 0;
const unsub = api.subscribeLanguage(() => changes++);
api.setLanguage("en");
assert.equal(api.t("Entrar"), "Sign in");
assert.equal(
  api.t("Organizar {v0}", { v0: "Receita João.xlsx" }),
  "Organize Receita João.xlsx",
);
assert.equal(
  api.t("Nome personalizado do cliente"),
  "Nome personalizado do cliente",
);
assert.equal(document.documentElement.lang, "en");
assert.equal(saved.get("drivevision.language.v1"), "en");
api.setLanguage("es");
assert.equal(api.t("Entrar"), "Iniciar sesión");
api.setLanguage("pt-BR");
assert.equal(api.t("Entrar"), "Entrar");
assert.equal(changes, 3);
unsub();
console.log(
  `PASS ${keys.size} interface strings in English/Spanish, placeholders, brands, stable control values, language persistence and Portuguese fallback`,
);
