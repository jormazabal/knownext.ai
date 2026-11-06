import { Schema } from "@milkdown/kit/prose/model";
import { expect, it } from "vitest";
import { documentHeadings, documentMatches } from "./documentTools";
const schema = new Schema({ nodes: {
  doc: { content: "block+" }, paragraph: { content: "inline*", group: "block" },
  heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } } },
  image: { inline: true, group: "inline" }, text: { group: "inline" },
}, marks: { strong: {} } });
it("finds literal text across formatting marks without treating regex characters as expressions", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Hello "), schema.text("world", [schema.mark("strong")]), schema.text(" [x].")])]);
  expect(documentMatches(doc, "hello world")).toEqual([{ from: 1, to: 12, text: "Hello world" }]);
  expect(documentMatches(doc, "[x].")).toEqual([{ from: 13, to: 17, text: "[x]." }]);
  expect(documentMatches(doc, ".")).toEqual([{ from: 16, to: 17, text: "." }]);
});
it("keeps offsets correct after an inline image and does not match across blocks", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("a"), schema.node("image"), schema.text("target")]), schema.node("paragraph", null, [schema.text("next")])]);
  expect(documentMatches(doc, "target")[0].from).toBe(3);
  expect(documentMatches(doc, "targetnext")).toEqual([]);
});
it("extracts headings from the editor model and bounds huge match sets", () => {
  const doc = schema.node("doc", null, [schema.node("heading", { level: 2 }, [schema.text("Section")]), schema.node("paragraph", null, [schema.text("a".repeat(2000))])]);
  expect(documentHeadings(doc)).toEqual([{ position: 1, level: 2, text: "Section" }]);
  expect(documentMatches(doc, "a")).toHaveLength(1001);
});

it("combines case sensitivity and whole words across inline marks with Unicode neighbours", () => {
  const paragraph = schema.node("paragraph", null, [schema.text("Plan PLAN planner unPlan _Plan Plan2 café cafe\u0301 𐐀Plan "), schema.text("Pl", [schema.mark("strong")]), schema.text("an.")]);
  const doc = schema.node("doc", null, [paragraph]);
  expect(documentMatches(doc, "plan", 1001, {wholeWord: true}).map(match=>match.text)).toEqual(["Plan", "PLAN", "Plan"]);
  expect(documentMatches(doc, "Plan", 1001, {wholeWord: true, caseSensitive: true}).map(match=>match.text)).toEqual(["Plan", "Plan"]);
  expect(documentMatches(doc, "cafe", 1001, {wholeWord: true})).toEqual([]);
  const last = documentMatches(doc, "Plan", 1001, {wholeWord: true, caseSensitive: true})[1];
  expect(doc.textBetween(last.from,last.to)).toBe("Plan");
});

it("counts accepted matches, bounds query input and never joins a leaf or textblock", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("planet planet plan plan")]), schema.node("paragraph", null, [schema.text("pl"),schema.node("image"),schema.text("an")])]);
  expect(documentMatches(doc, "plan", 1, {wholeWord: true})).toHaveLength(1);
  expect(documentMatches(doc, "plan", 1, {wholeWord: true})[0].from).toBe(15);
  expect(documentMatches(doc, "pl\uFFFCan")).toEqual([]);
  expect(documentMatches(doc, "a".repeat(201))).toEqual([]);
  expect(documentMatches(doc, "", 1001, {wholeWord:true})).toEqual([]);
});
