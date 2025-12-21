// ABOUTME: Example test file demonstrating Deno test runner configuration.
// ABOUTME: Verifies testing infrastructure is working correctly.

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

describe("Testing Infrastructure", () => {
  it("should run a basic assertion", () => {
    assertEquals(1 + 1, 2);
  });

  it("should handle string comparisons", () => {
    assertEquals("hello", "hello");
  });
});
