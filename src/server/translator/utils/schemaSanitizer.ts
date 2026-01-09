/**
 * JSON Schema Sanitizer for Antigravity API
 *
 * Claude/Gemini in VALIDATED mode rejects certain JSON Schema features.
 * This sanitizer removes or converts unsupported constraints to description hints.
 */

import type { GeminiTool, GeminiFunctionDeclaration } from "../../../shared/types.js";

// Placeholder property for empty schemas
// Claude VALIDATED mode requires at least one property in object schemas
const EMPTY_SCHEMA_PLACEHOLDER_NAME = "_placeholder";
const EMPTY_SCHEMA_PLACEHOLDER_DESCRIPTION = "Placeholder. Always pass true.";

// Unsupported constraint keywords that should be moved to description hints
const UNSUPPORTED_CONSTRAINTS = [
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "pattern",
    "minItems",
    "maxItems",
    "minProperties",
    "maxProperties",
    "format",
    "default",
    "examples",
] as const;

// Keywords that should be removed entirely
const UNSUPPORTED_KEYWORDS = [
    ...UNSUPPORTED_CONSTRAINTS,
    "$schema",
    "$defs",
    "definitions",
    "const",
    "$ref",
    "additionalProperties",
    "propertyNames",
    "title",
    "$id",
    "$comment",
] as const;

type SchemaObject = Record<string, unknown>;

/**
 * Check if value is a plain object
 */
function isPlainObject(value: unknown): value is SchemaObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep clone an object
 */
function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((item) => deepClone(item)) as T;
    const cloned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        cloned[key] = deepClone(value);
    }
    return cloned as T;
}

/**
 * Appends a hint to a schema's description field.
 */
function appendDescriptionHint(schema: SchemaObject, hint: string): SchemaObject {
    const existing = typeof schema.description === "string" ? schema.description : "";
    const newDescription = existing ? `${existing} (${hint})` : hint;
    return { ...schema, description: newDescription };
}

/**
 * Convert const to enum
 * { const: "value" } → { enum: ["value"] }
 */
function convertConstToEnum(schema: SchemaObject): SchemaObject {
    const result = { ...schema };
    if ("const" in result && !("enum" in result)) {
        result.enum = [result.const];
        delete result.const;
    }
    return result;
}

/**
 * Flatten type arrays
 * { type: ["string", "null"] } → { type: "string" } + description hint
 */
function flattenTypeArrays(schema: SchemaObject): SchemaObject {
    let result = { ...schema };

    if (Array.isArray(result.type)) {
        const types = result.type as string[];
        // Filter out "null" and keep the primary type
        const nonNullTypes = types.filter((t) => t !== "null");
        const hasNull = types.includes("null");

        if (nonNullTypes.length > 0) {
            result.type = nonNullTypes[0];
            if (hasNull) {
                result = appendDescriptionHint(result, "nullable");
            }
            if (nonNullTypes.length > 1) {
                result = appendDescriptionHint(result, `types: ${types.join(", ")}`);
            }
        }
    }

    return result;
}

/**
 * Merge allOf schemas
 * { allOf: [A, B, C] } → merge all properties
 */
function mergeAllOf(schema: SchemaObject): SchemaObject {
    let result = { ...schema };

    if (Array.isArray(result.allOf)) {
        const merged: SchemaObject = {};
        const allSchemas = result.allOf as SchemaObject[];

        for (const subSchema of allSchemas) {
            if (isPlainObject(subSchema)) {
                // Deep merge properties
                if (subSchema.properties && isPlainObject(subSchema.properties)) {
                    if (!merged.properties) {
                        merged.properties = {};
                    }
                    Object.assign(merged.properties as SchemaObject, deepClone(subSchema.properties));
                }
                // Merge other fields
                for (const [key, value] of Object.entries(subSchema)) {
                    if (key !== 'properties') {
                        merged[key] = deepClone(value);
                    }
                }
            }
        }

        delete result.allOf;
        // Merge properties separately to avoid overwriting
        if (merged.properties) {
            if (!result.properties) {
                result.properties = {};
            }
            Object.assign(result.properties as SchemaObject, merged.properties);
        }
        // Merge other fields
        for (const [key, value] of Object.entries(merged)) {
            if (key !== 'properties' && !result[key]) {
                result[key] = value;
            }
        }
    }

    return result;
}

/**
 * Flatten anyOf/oneOf by selecting the most complex schema
 * { anyOf: [A, B, C] } → select schema with most properties
 */
function flattenAnyOfOneOf(schema: SchemaObject): SchemaObject {
    let result = { ...schema };

    for (const key of ["anyOf", "oneOf"] as const) {
        if (Array.isArray(result[key])) {
            const schemas = result[key] as SchemaObject[];

            // Select the most complex schema (most properties)
            let selected: SchemaObject = {};
            let maxComplexity = -1;

            for (const subSchema of schemas) {
                if (isPlainObject(subSchema)) {
                    const complexity = Object.keys(subSchema).length;
                    if (complexity > maxComplexity) {
                        maxComplexity = complexity;
                        selected = subSchema;
                    }
                }
            }

            delete result[key];
            if (Object.keys(selected).length > 0) {
                result = { ...selected, ...result };
                result = appendDescriptionHint(result, `${key} flattened`);
            }
        }
    }

    return result;
}

/**
 * Moves unsupported constraints to description hints.
 * { minLength: 1, maxLength: 100 } → adds "(minLength: 1, maxLength: 100)" to description
 */
function moveConstraintsToDescription(schema: unknown): unknown {
    if (!isPlainObject(schema)) {
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map((item) => moveConstraintsToDescription(item));
    }

    let result: SchemaObject = { ...schema };

    // Move constraint values to description
    const hints: string[] = [];
    for (const constraint of UNSUPPORTED_CONSTRAINTS) {
        if (result[constraint] !== undefined && typeof result[constraint] !== "object") {
            hints.push(`${constraint}: ${result[constraint]}`);
        }
    }

    if (hints.length > 0) {
        result = appendDescriptionHint(result, hints.join(", "));
    }

    // Recursively process nested objects
    for (const [key, value] of Object.entries(result)) {
        if (typeof value === "object" && value !== null) {
            result[key] = moveConstraintsToDescription(value);
        }
    }

    return result;
}

/**
 * Removes unsupported keywords from schema.
 */
function removeUnsupportedKeywords(schema: unknown, insideProperties: boolean = false): unknown {
    if (!isPlainObject(schema)) {
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map((item) => removeUnsupportedKeywords(item, false));
    }

    const result: SchemaObject = {};
    for (const [key, value] of Object.entries(schema)) {
        // Skip unsupported keywords (unless we're inside properties where keys are property names)
        if (!insideProperties && (UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) {
            continue;
        }

        if (typeof value === "object" && value !== null) {
            // Special handling for 'properties' object - preserve property names
            if (key === "properties") {
                result[key] = removeUnsupportedKeywords(value, true);
            } else {
                result[key] = removeUnsupportedKeywords(value, false);
            }
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * Add placeholder for empty object schemas
 * {} → { properties: { _placeholder: { type: "boolean", description: "..." } } }
 */
function addEmptySchemaPlaceholder(schema: SchemaObject): SchemaObject {
    if (
        schema.type === "object" &&
        (!schema.properties || Object.keys(schema.properties as object).length === 0)
    ) {
        return {
            ...schema,
            properties: {
                [EMPTY_SCHEMA_PLACEHOLDER_NAME]: {
                    type: "boolean",
                    description: EMPTY_SCHEMA_PLACEHOLDER_DESCRIPTION,
                },
            },
        };
    }
    return schema;
}

/**
 * Main schema cleaning function
 * Transforms a JSON schema to be compatible with Antigravity API.
 */
export function cleanJSONSchemaForAntigravity(schema: unknown): unknown {
    if (!isPlainObject(schema)) {
        return schema;
    }

    let result = deepClone(schema) as SchemaObject;

    // Phase 1: Convert and add hints
    result = convertConstToEnum(result);
    result = flattenTypeArrays(result);

    // Phase 2: Flatten complex structures
    result = mergeAllOf(result);
    result = flattenAnyOfOneOf(result);

    // Phase 3: Move constraints to description
    result = moveConstraintsToDescription(result) as SchemaObject;

    // Phase 4: Cleanup
    result = removeUnsupportedKeywords(result) as SchemaObject;
    result = addEmptySchemaPlaceholder(result);

    // Recursively process nested schemas
    if (result.properties && isPlainObject(result.properties)) {
        const cleanedProps: SchemaObject = {};
        for (const [key, value] of Object.entries(result.properties)) {
            cleanedProps[key] = cleanJSONSchemaForAntigravity(value);
        }
        result.properties = cleanedProps;
    }

    if (result.items) {
        result.items = cleanJSONSchemaForAntigravity(result.items);
    }

    return result;
}

/**
 * Sanitize tools for Antigravity API
 * Cleans all function declarations in the tools array
 */
export function sanitizeToolsForAntigravity(
    tools: GeminiTool[] | undefined
): GeminiTool[] | undefined {
    if (!tools || tools.length === 0) {
        return tools;
    }

    return tools.map((tool) => {
        if (!tool.functionDeclarations) {
            return tool;
        }

        const cleanedDeclarations = tool.functionDeclarations.map((decl) => {
            const cleaned: GeminiFunctionDeclaration = { ...decl };

            // Clean parameters schema
            if (cleaned.parameters) {
                cleaned.parameters = cleanJSONSchemaForAntigravity(
                    cleaned.parameters
                ) as Record<string, unknown>;
            }

            return cleaned;
        });

        return {
            ...tool,
            functionDeclarations: cleanedDeclarations,
        };
    });
}
