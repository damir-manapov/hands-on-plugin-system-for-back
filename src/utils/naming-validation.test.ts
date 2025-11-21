import { describe, it, expect } from "vitest";
import {
  validatePluginName,
  validateTableName,
  validateTopicName,
  validateBucketName,
  validateResourceNames,
} from "./naming-validation.js";

describe("validatePluginName", () => {
  it("should accept valid plugin names", () => {
    expect(() => validatePluginName("my-plugin")).not.toThrow();
    expect(() => validatePluginName("plugin_123")).not.toThrow();
    expect(() => validatePluginName("a")).not.toThrow();
    expect(() => validatePluginName("a".repeat(63))).not.toThrow();
  });

  it("should reject empty names", () => {
    expect(() => validatePluginName("")).toThrow();
    expect(() => validatePluginName("   ")).toThrow();
  });

  it("should reject names that are too long", () => {
    expect(() => validatePluginName("a".repeat(64))).toThrow();
  });

  it("should reject names starting with uppercase", () => {
    expect(() => validatePluginName("MyPlugin")).toThrow();
  });

  it("should reject names with spaces", () => {
    expect(() => validatePluginName("my plugin")).toThrow();
  });

  it("should reject names ending with dash or underscore", () => {
    expect(() => validatePluginName("my-plugin-")).toThrow();
    expect(() => validatePluginName("my_plugin_")).toThrow();
  });

  it("should reject names with consecutive dashes or underscores", () => {
    expect(() => validatePluginName("my--plugin")).toThrow();
    expect(() => validatePluginName("my__plugin")).toThrow();
  });

  it("should reject names with invalid characters", () => {
    expect(() => validatePluginName("my.plugin")).toThrow();
    expect(() => validatePluginName("my@plugin")).toThrow();
  });
});

describe("validateTableName", () => {
  it("should accept valid table names", () => {
    expect(() => validateTableName("users")).not.toThrow();
    expect(() => validateTableName("user_orders")).not.toThrow();
    expect(() => validateTableName("_private_table")).not.toThrow();
    expect(() => validateTableName("table123")).not.toThrow();
  });

  it("should reject names with dashes", () => {
    expect(() => validateTableName("user-orders")).toThrow();
  });

  it("should reject names ending with underscore", () => {
    expect(() => validateTableName("users_")).toThrow();
  });

  it("should reject names with consecutive underscores", () => {
    expect(() => validateTableName("user__orders")).toThrow();
  });

  it("should reject names with uppercase", () => {
    expect(() => validateTableName("Users")).toThrow();
  });
});

describe("validateTopicName", () => {
  it("should accept valid topic names", () => {
    expect(() => validateTopicName("user-events")).not.toThrow();
    expect(() => validateTopicName("user_events")).not.toThrow();
    expect(() => validateTopicName("user.events")).not.toThrow();
    expect(() => validateTopicName("a".repeat(249))).not.toThrow();
  });

  it("should reject names ending with dot", () => {
    expect(() => validateTopicName("user.events.")).toThrow();
  });

  it("should reject names with consecutive dots", () => {
    expect(() => validateTopicName("user..events")).toThrow();
  });

  it("should reject names with uppercase", () => {
    expect(() => validateTopicName("UserEvents")).toThrow();
  });
});

describe("validateBucketName", () => {
  it("should accept valid bucket names", () => {
    expect(() => validateBucketName("my-bucket")).not.toThrow();
    expect(() => validateBucketName("my.bucket")).not.toThrow();
    expect(() => validateBucketName("bucket123")).not.toThrow();
  });

  it("should reject names shorter than 3 characters", () => {
    expect(() => validateBucketName("ab")).toThrow();
  });

  it("should reject names ending with dash or dot", () => {
    expect(() => validateBucketName("my-bucket-")).toThrow();
    expect(() => validateBucketName("my.bucket.")).toThrow();
  });

  it("should reject names with consecutive dots", () => {
    expect(() => validateBucketName("my..bucket")).toThrow();
  });

  it("should reject IP address format", () => {
    expect(() => validateBucketName("192.168.1.1")).toThrow();
  });

  it("should reject names with uppercase", () => {
    expect(() => validateBucketName("MyBucket")).toThrow();
  });
});

describe("validateResourceNames", () => {
  it("should validate all names in array", () => {
    expect(() =>
      validateResourceNames(["users", "orders"], validateTableName, "table")
    ).not.toThrow();
  });

  it("should reject invalid names", () => {
    expect(() =>
      validateResourceNames(["users", "invalid-name"], validateTableName, "table")
    ).toThrow();
  });

  it("should reject duplicate names", () => {
    expect(() => validateResourceNames(["users", "users"], validateTableName, "table")).toThrow();
  });

  it("should reject non-array input", () => {
    expect(() =>
      validateResourceNames("not-array" as unknown as string[], validateTableName, "table")
    ).toThrow();
  });
});
