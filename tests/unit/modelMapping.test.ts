import { describe, it, expect } from "vitest";
import {
    resolveModelId,
    resolveModelRoute,
    setCustomModelMapping,
    getCustomModelMapping,
} from "../../src/shared/constants.js";

describe("Model Mapping", () => {
    describe("GPT to Gemini redirection", () => {
        it("should map gpt-4 to gemini-2.5-pro", () => {
            expect(resolveModelId("gpt-4")).toBe("gemini-2.5-pro");
        });

        it("should map gpt-4o to gemini-2.5-pro", () => {
            expect(resolveModelId("gpt-4o")).toBe("gemini-2.5-pro");
        });

        it("should map gpt-4-turbo to gemini-2.5-pro", () => {
            expect(resolveModelId("gpt-4-turbo")).toBe("gemini-2.5-pro");
        });

        it("should map gpt-4o-mini to gemini-2.5-flash", () => {
            expect(resolveModelId("gpt-4o-mini")).toBe("gemini-2.5-flash");
        });

        it("should map gpt-3.5-turbo to gemini-2.5-flash", () => {
            expect(resolveModelId("gpt-3.5-turbo")).toBe("gemini-2.5-flash");
        });

        it("should map all GPT-4 variants to gemini-2.5-pro", () => {
            const gpt4Variants = [
                "gpt-4-0125-preview",
                "gpt-4-1106-preview",
                "gpt-4-0613",
                "gpt-4o-2024-05-13",
                "gpt-4o-2024-08-06",
            ];

            for (const variant of gpt4Variants) {
                expect(resolveModelId(variant)).toBe("gemini-2.5-pro");
            }
        });

        it("should map all GPT-3.5 variants to gemini-2.5-flash", () => {
            const gpt35Variants = [
                "gpt-3.5-turbo-16k",
                "gpt-3.5-turbo-0125",
                "gpt-3.5-turbo-1106",
                "gpt-3.5-turbo-0613",
            ];

            for (const variant of gpt35Variants) {
                expect(resolveModelId(variant)).toBe("gemini-2.5-flash");
            }
        });
    });

    describe("Claude model mapping", () => {
        it("should map Claude aliases correctly", () => {
            expect(resolveModelId("claude-sonnet-4-5-20250929")).toBe(
                "claude-sonnet-4-5-thinking"
            );
            expect(resolveModelId("claude-3-5-sonnet-20241022")).toBe(
                "claude-sonnet-4-5"
            );
            expect(resolveModelId("claude-opus-4")).toBe("claude-opus-4-5-thinking");
        });

        it("should pass through native Claude models", () => {
            expect(resolveModelId("claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
            expect(resolveModelId("claude-opus-4-5-thinking")).toBe(
                "claude-opus-4-5-thinking"
            );
        });
    });

    describe("Gemini model pass-through", () => {
        it("should pass through native Gemini models", () => {
            expect(resolveModelId("gemini-2.5-pro")).toBe("gemini-2.5-pro");
            expect(resolveModelId("gemini-2.5-flash")).toBe("gemini-2.5-flash");
            expect(resolveModelId("gemini-3-pro")).toBe("gemini-3-pro");
            expect(resolveModelId("gemini-3-flash")).toBe("gemini-3-flash");
        });

        it("should pass through thinking variants", () => {
            expect(resolveModelId("gemini-2.5-flash-thinking")).toBe(
                "gemini-2.5-flash-thinking"
            );
        });

        it("should handle dynamic Gemini models with suffixes", () => {
            // These should pass through as-is
            expect(resolveModelRoute("gemini-2.5-pro-experimental")).toBe(
                "gemini-2.5-pro-experimental"
            );
            expect(resolveModelRoute("gemini-3-pro-preview")).toBe(
                "gemini-3-pro-preview"
            );
        });
    });

    describe("Custom model mapping", () => {
        it("should support custom model mappings with exact match", () => {
            setCustomModelMapping({
                "my-custom-model": "gemini-3-pro",
            });

            expect(resolveModelRoute("my-custom-model")).toBe("gemini-3-pro");

            // Reset
            setCustomModelMapping({});
        });

        it("should support wildcard matching in custom mappings", () => {
            setCustomModelMapping({
                "gpt-5*": "gemini-3-pro",
            });

            expect(resolveModelRoute("gpt-5")).toBe("gemini-3-pro");
            expect(resolveModelRoute("gpt-5-turbo")).toBe("gemini-3-pro");
            expect(resolveModelRoute("gpt-5-preview")).toBe("gemini-3-pro");

            // Reset
            setCustomModelMapping({});
        });

        it("should prioritize custom mappings over system mappings", () => {
            setCustomModelMapping({
                "gpt-4": "gemini-3-flash", // Override system mapping
            });

            expect(resolveModelRoute("gpt-4")).toBe("gemini-3-flash");

            // Reset
            setCustomModelMapping({});
        });

        it("should get and set custom mappings", () => {
            const customMapping = {
                "test-model": "gemini-2.5-pro",
                "another-model": "claude-sonnet-4-5",
            };

            setCustomModelMapping(customMapping);
            const retrieved = getCustomModelMapping();

            expect(retrieved).toEqual(customMapping);

            // Reset
            setCustomModelMapping({});
        });
    });

    describe("Fallback behavior", () => {
        it("should fallback to claude-sonnet-4-5 for unknown models", () => {
            expect(resolveModelRoute("unknown-model")).toBe("claude-sonnet-4-5");
            expect(resolveModelRoute("some-random-name")).toBe("claude-sonnet-4-5");
        });

        it("should not fallback for models starting with gemini-", () => {
            expect(resolveModelRoute("gemini-new-model")).toBe("gemini-new-model");
        });

        it("should not fallback for models containing thinking", () => {
            expect(resolveModelRoute("new-thinking-model")).toBe(
                "new-thinking-model"
            );
        });
    });
});
