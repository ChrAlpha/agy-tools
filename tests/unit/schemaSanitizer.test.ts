/**
 * Test for Schema Sanitizer
 * 
 * Validates that the JSON Schema sanitizer correctly transforms
 * schemas to be compatible with Antigravity API.
 */

import { describe, it, expect } from "vitest";
import { cleanJSONSchemaForAntigravity } from "../../src/server/translator/index.js";

describe("Schema Sanitizer", () => {
    it("should convert const to enum", () => {
        const input = {
            type: "string",
            const: "value",
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.enum).toEqual(["value"]);
        expect(result.const).toBeUndefined();
    });

    it("should flatten type arrays", () => {
        const input = {
            type: ["string", "null"],
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.type).toBe("string");
        expect(result.description).toContain("nullable");
    });

    it("should merge allOf", () => {
        const input = {
            allOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { properties: { b: { type: "number" } } },
            ],
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.allOf).toBeUndefined();
        expect(result.properties.a).toBeDefined();
        expect(result.properties.b).toBeDefined();
    });

    it("should flatten anyOf by selecting most complex schema", () => {
        const input = {
            anyOf: [
                { type: "string" },
                { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } },
                { type: "number" },
            ],
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.anyOf).toBeUndefined();
        expect(result.type).toBe("object");
        expect(result.properties).toBeDefined();
    });

    it("should move constraints to description", () => {
        const input = {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "^[a-z]+$",
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.minLength).toBeUndefined();
        expect(result.maxLength).toBeUndefined();
        expect(result.pattern).toBeUndefined();
        expect(result.description).toContain("minLength: 1");
        expect(result.description).toContain("maxLength: 100");
        expect(result.description).toContain("pattern:");
    });

    it("should remove unsupported keywords", () => {
        const input = {
            type: "object",
            $schema: "http://json-schema.org/draft-07/schema#",
            $id: "test",
            $comment: "comment",
            $ref: "#/definitions/test",
            title: "Test Schema",
            default: {},
            examples: [{}],
            additionalProperties: false,
            properties: {
                name: { type: "string" },
            },
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.$schema).toBeUndefined();
        expect(result.$id).toBeUndefined();
        expect(result.$comment).toBeUndefined();
        expect(result.$ref).toBeUndefined();
        expect(result.title).toBeUndefined();
        expect(result.default).toBeUndefined();
        expect(result.examples).toBeUndefined();
        expect(result.additionalProperties).toBeUndefined();
        expect(result.properties).toBeDefined();
    });

    it("should add placeholder for empty object schemas", () => {
        const input = {
            type: "object",
            properties: {},
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.properties._placeholder).toBeDefined();
        expect(result.properties._placeholder.type).toBe("boolean");
    });

    it("should handle nested schemas", () => {
        const input = {
            type: "object",
            properties: {
                nested: {
                    type: "object",
                    properties: {
                        deep: {
                            type: ["string", "null"],
                            minLength: 5,
                        },
                    },
                },
            },
        };

        const result = cleanJSONSchemaForAntigravity(input) as any;

        expect(result.properties.nested.properties.deep.type).toBe("string");
        expect(result.properties.nested.properties.deep.description).toContain("nullable");
        expect(result.properties.nested.properties.deep.description).toContain("minLength: 5");
    });
});
