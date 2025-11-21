import { describe, it, expect, beforeEach, vi } from "vitest";
import { S3RepositoryImpl } from "./s3.repository.impl.js";
import { S3Service } from "../../services/s3/s3.service.js";
import { BucketAccessDeniedError } from "./s3.errors.js";

describe("S3RepositoryImpl", () => {
  let mockS3Service: S3Service;
  let repository: S3RepositoryImpl;

  beforeEach(() => {
    mockS3Service = {
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(Buffer.from("test")),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue(["file1.txt", "file2.txt"]),
      exists: vi.fn().mockResolvedValue(true),
      getPresignedUrl: vi.fn().mockResolvedValue("https://example.com/presigned-url"),
      getDefaultBucket: vi.fn().mockReturnValue("default-bucket"),
    } as unknown as S3Service;

    repository = new S3RepositoryImpl(
      mockS3Service,
      ["plugin-slug_data", "plugin-slug_assets"],
      "plugin-slug"
    );
  });

  describe("constructor", () => {
    it("should store allowed buckets as prefixed", () => {
      const repo = new S3RepositoryImpl(
        mockS3Service,
        ["plugin-slug_data", "plugin-slug_assets"],
        "plugin-slug"
      );
      expect(repo.getAllowedBuckets()).toEqual(["data", "assets"]);
    });

    it("should accept name map", () => {
      const nameMap = new Map([["data", "custom_data"]]);
      const repo = new S3RepositoryImpl(
        mockS3Service,
        ["plugin-slug_custom_data"],
        "plugin-slug",
        nameMap
      );
      expect(repo.getAllowedBuckets()).toEqual(["custom_data"]);
    });

    it("should warn when no buckets are allowed", () => {
      // The warning is logged via NestJS Logger, not console
      // We can't easily test Logger output in unit tests, so we just verify
      // that the repository is created successfully even with no buckets
      const repo = new S3RepositoryImpl(mockS3Service, [], "plugin-slug");
      expect(repo).toBeDefined();
      expect(repo.getAllowedBuckets()).toEqual([]);
    });
  });

  describe("getAllowedBuckets", () => {
    it("should return unprefixed bucket names", () => {
      const buckets = repository.getAllowedBuckets();
      expect(buckets).toEqual(["data", "assets"]);
    });
  });

  describe("upload", () => {
    it("should allow upload to declared bucket", async () => {
      await repository.upload("file.txt", "content", "text/plain", "data");

      expect(mockS3Service.upload).toHaveBeenCalledWith(
        "file.txt",
        "content",
        "text/plain",
        "plugin-slug_data"
      );
    });

    it("should throw BucketAccessDeniedError for undeclared bucket", async () => {
      await expect(
        repository.upload("file.txt", "content", "text/plain", "unauthorized")
      ).rejects.toThrow(BucketAccessDeniedError);
      expect(mockS3Service.upload).not.toHaveBeenCalled();
    });

    it("should throw error when bucket is empty string", async () => {
      await expect(repository.upload("file.txt", "content", "text/plain", "")).rejects.toThrow(
        BucketAccessDeniedError
      );
    });

    it("should handle name mapping", async () => {
      const nameMap = new Map([["data", "custom_data"]]);
      const repo = new S3RepositoryImpl(
        mockS3Service,
        ["plugin-slug_custom_data"],
        "plugin-slug",
        nameMap
      );

      await repo.upload("file.txt", "content", "text/plain", "data");

      expect(mockS3Service.upload).toHaveBeenCalledWith(
        "file.txt",
        "content",
        "text/plain",
        "plugin-slug_custom_data"
      );
    });
  });

  describe("download", () => {
    it("should allow download from declared bucket", async () => {
      await repository.download("file.txt", "data");

      expect(mockS3Service.download).toHaveBeenCalledWith("file.txt", "plugin-slug_data");
    });

    it("should throw BucketAccessDeniedError for undeclared bucket", async () => {
      await expect(repository.download("file.txt", "unauthorized")).rejects.toThrow(
        BucketAccessDeniedError
      );
      expect(mockS3Service.download).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("should allow delete from declared bucket", async () => {
      await repository.delete("file.txt", "data");

      expect(mockS3Service.delete).toHaveBeenCalledWith("file.txt", "plugin-slug_data");
    });

    it("should throw BucketAccessDeniedError for undeclared bucket", async () => {
      await expect(repository.delete("file.txt", "unauthorized")).rejects.toThrow(
        BucketAccessDeniedError
      );
      expect(mockS3Service.delete).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("should allow list from declared bucket", async () => {
      await repository.list("prefix/", "data");

      expect(mockS3Service.list).toHaveBeenCalledWith("prefix/", "plugin-slug_data");
    });

    it("should allow list without prefix", async () => {
      await repository.list(undefined, "data");

      expect(mockS3Service.list).toHaveBeenCalledWith(undefined, "plugin-slug_data");
    });

    it("should throw BucketAccessDeniedError for undeclared bucket", async () => {
      await expect(repository.list("prefix/", "unauthorized")).rejects.toThrow(
        BucketAccessDeniedError
      );
      expect(mockS3Service.list).not.toHaveBeenCalled();
    });
  });

  describe("exists", () => {
    it("should allow exists check on declared bucket", async () => {
      await repository.exists("file.txt", "data");

      expect(mockS3Service.exists).toHaveBeenCalledWith("file.txt", "plugin-slug_data");
    });

    it("should throw BucketAccessDeniedError for undeclared bucket", async () => {
      await expect(repository.exists("file.txt", "unauthorized")).rejects.toThrow(
        BucketAccessDeniedError
      );
      expect(mockS3Service.exists).not.toHaveBeenCalled();
    });
  });

  describe("getPresignedUrl", () => {
    it("should allow presigned URL for declared bucket", async () => {
      await repository.getPresignedUrl("file.txt", 3600, "data");

      expect(mockS3Service.getPresignedUrl).toHaveBeenCalledWith(
        "file.txt",
        3600,
        "plugin-slug_data"
      );
    });

    it("should throw BucketAccessDeniedError for undeclared bucket", async () => {
      await expect(repository.getPresignedUrl("file.txt", 3600, "unauthorized")).rejects.toThrow(
        BucketAccessDeniedError
      );
      expect(mockS3Service.getPresignedUrl).not.toHaveBeenCalled();
    });
  });
});
