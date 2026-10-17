import test from "node:test";
import assert from "node:assert/strict";
import { verifyQuestionEvidence } from "./sourceVerification.js";

test("accepts a quotation that appears in the linked PDF text", () => {
  const result = verifyQuestionEvidence(
    { sourceEvidence: "energy is conserved in an isolated system." },
    "In mechanics, energy is conserved in an isolated system."
  );

  assert.equal(result.verified, true);
  assert.equal(result.status, "verified");
});

test("rejects a quotation that is not present in the PDF text", () => {
  const result = verifyQuestionEvidence(
    { sourceEvidence: "The speed of light is variable." },
    "The speed of light in vacuum is constant."
  );

  assert.equal(result.verified, false);
  assert.equal(result.status, "unverified");
});

test("rejects missing, empty, and malformed evidence", () => {
  for (const question of [
    {},
    { sourceEvidence: "" },
    { sourceEvidence: "   " },
    { sourceEvidence: 42 },
    null,
  ]) {
    const result = verifyQuestionEvidence(question, "Some source text.");
    assert.equal(result.verified, false);
    assert.equal(result.status, "unverified");
  }
});

test("rejects empty source text", () => {
  const result = verifyQuestionEvidence(
    { sourceEvidence: "A real quotation." },
    "   "
  );

  assert.equal(result.verified, false);
  assert.equal(result.status, "unverified");
});

test("matches whitespace-normalized quotations", () => {
  const result = verifyQuestionEvidence(
    { sourceEvidence: "Energy   is conserved\n in an isolated system." },
    "Energy is conserved in an isolated system."
  );

  assert.equal(result.verified, true);
});
