import { describe, it, expect } from "vitest";
import { BucketAccessDeniedError } from "./s3.errors.js";

describe("S3 Repository Errors", () => {
  describe("BucketAccessDeniedError", () => {
    it("should create error with bucket name and allowed buckets", () => {
      const error = new BucketAccessDeniedError("unauthorized-bucket", ["bucket1", "bucket2"]);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("BucketAccessDeniedError");
      expect(error.message).toContain("unauthorized-bucket");
      expect(error.message).toContain("bucket1");
      expect(error.message).toContain("bucket2");
    });

    it("should format error message correctly", () => {
      const error = new BucketAccessDeniedError("bad-bucket", ["bucket1", "bucket2"]);

      expect(error.message).toBe(
        "Access denied to bucket 'bad-bucket'. Allowed buckets: bucket1, bucket2"
      );
    });

    it("should handle empty bucket name", () => {
      const error = new BucketAccessDeniedError("", ["bucket1"]);

      expect(error.message).toContain("bucket '");
      expect(error.message).toContain("bucket1");
    });
  });
});
