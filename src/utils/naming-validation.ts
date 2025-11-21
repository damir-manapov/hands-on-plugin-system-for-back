import { z } from "zod";

/**
 * Naming convention validation schemas using Zod
 */

// Plugin name: lowercase, alphanumeric with dashes/underscores, 1-63 characters
const pluginNameSchema = z
  .string()
  .min(1, "Plugin name must be at least 1 character")
  .max(63, "Plugin name must be at most 63 characters")
  .regex(/^[a-z0-9]/, "Plugin name must start with a lowercase letter or number")
  .regex(
    /^[a-z0-9_-]+$/,
    "Plugin name must contain only lowercase letters, numbers, dashes, and underscores"
  )
  .refine((name) => !/[-_]$/.test(name), "Plugin name cannot end with a dash or underscore")
  .refine(
    (name) => !/[-_]{2,}/.test(name),
    "Plugin name cannot have consecutive dashes or underscores"
  );

// Table name: lowercase, alphanumeric with underscores, 1-63 characters
const tableNameSchema = z
  .string()
  .min(1, "Table name must be at least 1 character")
  .max(63, "Table name must be at most 63 characters")
  .regex(/^[a-z_]/, "Table name must start with a lowercase letter or underscore")
  .regex(/^[a-z0-9_]+$/, "Table name must contain only lowercase letters, numbers, and underscores")
  .refine((name) => !/_$/.test(name), "Table name cannot end with an underscore")
  .refine((name) => !/_{2,}/.test(name), "Table name cannot have consecutive underscores");

// Topic name: lowercase, alphanumeric with dashes/underscores/dots, 1-249 characters
const topicNameSchema = z
  .string()
  .min(1, "Topic name must be at least 1 character")
  .max(249, "Topic name must be at most 249 characters")
  .regex(
    /^[a-z0-9._-]/,
    "Topic name must start with a lowercase letter, number, dash, underscore, or dot"
  )
  .regex(
    /^[a-z0-9._-]+$/,
    "Topic name must contain only lowercase letters, numbers, dashes, underscores, and dots"
  )
  .refine((name) => !/\.$/.test(name), "Topic name cannot end with a dot")
  .refine((name) => !/\.{2,}/.test(name), "Topic name cannot have consecutive dots");

// Bucket name: lowercase, alphanumeric with dashes/dots, 3-63 characters
const bucketNameSchema = z
  .string()
  .min(3, "Bucket name must be at least 3 characters")
  .max(63, "Bucket name must be at most 63 characters")
  .regex(/^[a-z0-9]/, "Bucket name must start with a lowercase letter or number")
  .regex(
    /^[a-z0-9.-]+$/,
    "Bucket name must contain only lowercase letters, numbers, dashes, and dots"
  )
  .refine((name) => !/[-.]$/.test(name), "Bucket name cannot end with a dash or dot")
  .refine((name) => !/\.{2,}/.test(name), "Bucket name cannot have consecutive dots")
  .refine(
    (name) => !/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(name),
    "Bucket name cannot be formatted as an IP address"
  );

/**
 * Validates plugin names
 * Rules: lowercase, alphanumeric with dashes/underscores, 1-63 characters
 * @param name Plugin name to validate
 * @throws Error if invalid
 */
export function validatePluginName(name: string): void {
  pluginNameSchema.parse(name);
}

/**
 * Validates database table names
 * Rules: lowercase, alphanumeric with underscores, 1-63 characters
 * @param name Table name to validate
 * @throws Error if invalid
 */
export function validateTableName(name: string): void {
  tableNameSchema.parse(name);
}

/**
 * Validates Kafka topic names
 * Rules: lowercase, alphanumeric with dashes/underscores/dots, 1-249 characters
 * @param name Topic name to validate
 * @throws Error if invalid
 */
export function validateTopicName(name: string): void {
  topicNameSchema.parse(name);
}

/**
 * Validates S3 bucket names
 * Rules: lowercase, alphanumeric with dashes/dots, 3-63 characters
 * @param name Bucket name to validate
 * @throws Error if invalid
 */
export function validateBucketName(name: string): void {
  bucketNameSchema.parse(name);
}

/**
 * Validates an array of resource names
 * @param names Array of names to validate
 * @param validator Validation function to use
 * @param resourceType Type of resource (for error messages)
 * @throws Error if invalid
 */
export function validateResourceNames(
  names: string[],
  validator: (name: string) => void,
  resourceType: string
): void {
  if (!Array.isArray(names)) {
    throw new Error(`${resourceType} must be an array`);
  }

  for (const name of names) {
    try {
      validator(name);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues.map((issue) => issue.message).join("; ");
        throw new Error(`Invalid ${resourceType} name '${name}': ${message}`);
      }
      throw new Error(
        `Invalid ${resourceType} name: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Check for duplicates
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate ${resourceType} names found: ${duplicates.join(", ")}`);
  }
}
