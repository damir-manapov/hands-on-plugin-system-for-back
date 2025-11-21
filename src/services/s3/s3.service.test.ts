import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { S3Service } from "./s3.service.js";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Mock AWS SDK - will be defined in vi.mock

vi.mock("@aws-sdk/client-s3", () => {
  const mockSendFn = vi.fn();

  // Create a proper class constructor that can be used with 'new'
  class MockS3Client {
    send = mockSendFn;

    constructor(_config?: unknown) {
      // Constructor can accept config but we don't need to use it
    }
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
    HeadObjectCommand: vi.fn(),
    CreateBucketCommand: vi.fn(),
    HeadBucketCommand: vi.fn(),
    __mockSend: mockSendFn,
    __mockS3Client: MockS3Client,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://example.com/presigned-url"),
}));

describe("S3Service", () => {
  let s3Service: S3Service;
  let mockSendFn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_BUCKET;
    delete process.env.S3_FORCE_PATH_STYLE;

    // Get mocks from module
    const s3Module = await import("@aws-sdk/client-s3");
    mockSendFn = (s3Module as unknown as { __mockSend: ReturnType<typeof vi.fn> }).__mockSend;

    // Clear mocks
    mockSendFn.mockClear();

    s3Service = new S3Service();
  });

  afterEach(async () => {
    if (s3Service) {
      await s3Service.onModuleDestroy();
    }
  });

  describe("constructor", () => {
    it("should create S3Client with default config", () => {
      // Verify S3Client was instantiated by checking the service has a client
      expect(s3Service.getClient()).toBeDefined();
    });

    it("should use environment variables when provided", async () => {
      process.env.S3_ENDPOINT = "http://custom:9000";
      process.env.S3_REGION = "us-west-2";
      process.env.S3_ACCESS_KEY_ID = "custom-key";
      process.env.S3_SECRET_ACCESS_KEY = "custom-secret";

      const service = new S3Service();
      // Verify service was created with custom config
      expect(service.getClient()).toBeDefined();
      await service.onModuleDestroy();
    });
  });

  describe("onModuleInit", () => {
    it("should ensure default bucket exists", async () => {
      mockSendFn.mockResolvedValueOnce({}); // HeadBucketCommand succeeds

      await s3Service.onModuleInit();

      expect(HeadBucketCommand).toHaveBeenCalled();
      expect(mockSendFn).toHaveBeenCalled();
    });

    it("should create bucket if it doesn't exist", async () => {
      // First call (HeadBucketCommand) fails with 404
      mockSendFn.mockRejectedValueOnce({
        $metadata: { httpStatusCode: 404 },
      });
      // Second call (CreateBucketCommand) succeeds
      mockSendFn.mockResolvedValueOnce({});

      await s3Service.onModuleInit();

      expect(HeadBucketCommand).toHaveBeenCalled();
      expect(CreateBucketCommand).toHaveBeenCalled();
    });
  });

  describe("ensureBucketExists", () => {
    it("should check if bucket exists", async () => {
      mockSendFn.mockResolvedValueOnce({});

      await s3Service.ensureBucketExists("test-bucket");

      expect(HeadBucketCommand).toHaveBeenCalledWith({ Bucket: "test-bucket" });
      expect(mockSendFn).toHaveBeenCalled();
    });

    it("should create bucket if it doesn't exist", async () => {
      mockSendFn
        .mockRejectedValueOnce({
          $metadata: { httpStatusCode: 404 },
        })
        .mockResolvedValueOnce({});

      await s3Service.ensureBucketExists("new-bucket");

      expect(CreateBucketCommand).toHaveBeenCalledWith({ Bucket: "new-bucket" });
    });
  });

  describe("upload", () => {
    it("should upload file to default bucket", async () => {
      mockSendFn.mockResolvedValueOnce({});

      await s3Service.upload("file.txt", "content", "text/plain");

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: "default-bucket",
        Key: "file.txt",
        Body: "content",
        ContentType: "text/plain",
      });
      expect(mockSendFn).toHaveBeenCalled();
    });

    it("should upload file to specified bucket", async () => {
      mockSendFn.mockResolvedValueOnce({});

      await s3Service.upload("file.txt", Buffer.from("content"), "text/plain", "custom-bucket");

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: "custom-bucket",
        Key: "file.txt",
        Body: Buffer.from("content"),
        ContentType: "text/plain",
      });
    });
  });

  describe("download", () => {
    it("should download file from default bucket", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield new Uint8Array([1, 2, 3]);
        },
      };
      mockSendFn.mockResolvedValueOnce({ Body: mockStream });

      const result = await s3Service.download("file.txt");

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: "default-bucket",
        Key: "file.txt",
      });
      expect(result).toBeInstanceOf(Buffer);
    });

    it("should download file from specified bucket", async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield new Uint8Array([1, 2, 3]);
        },
      };
      mockSendFn.mockResolvedValueOnce({ Body: mockStream });

      await s3Service.download("file.txt", "custom-bucket");

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: "custom-bucket",
        Key: "file.txt",
      });
    });
  });

  describe("delete", () => {
    it("should delete file from default bucket", async () => {
      mockSendFn.mockResolvedValueOnce({});

      await s3Service.delete("file.txt");

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: "default-bucket",
        Key: "file.txt",
      });
    });

    it("should delete file from specified bucket", async () => {
      mockSendFn.mockResolvedValueOnce({});

      await s3Service.delete("file.txt", "custom-bucket");

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: "custom-bucket",
        Key: "file.txt",
      });
    });
  });

  describe("list", () => {
    it("should list objects in default bucket", async () => {
      mockSendFn.mockResolvedValueOnce({
        Contents: [{ Key: "file1.txt" }, { Key: "file2.txt" }],
      });

      const result = await s3Service.list();

      expect(ListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: "default-bucket",
        Prefix: undefined,
      });
      expect(result).toEqual(["file1.txt", "file2.txt"]);
    });

    it("should list objects with prefix", async () => {
      mockSendFn.mockResolvedValueOnce({
        Contents: [{ Key: "prefix/file1.txt" }],
      });

      const result = await s3Service.list("prefix/");

      expect(ListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: "default-bucket",
        Prefix: "prefix/",
      });
      expect(result).toEqual(["prefix/file1.txt"]);
    });
  });

  describe("exists", () => {
    it("should return true if object exists", async () => {
      mockSendFn.mockResolvedValueOnce({});

      const result = await s3Service.exists("file.txt");

      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: "default-bucket",
        Key: "file.txt",
      });
      expect(result).toBe(true);
    });

    it("should return false if object doesn't exist", async () => {
      mockSendFn.mockRejectedValueOnce({
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });

      const result = await s3Service.exists("file.txt");

      expect(result).toBe(false);
    });
  });

  describe("getPresignedUrl", () => {
    it("should generate presigned URL for default bucket", async () => {
      await s3Service.getPresignedUrl("file.txt", 3600);

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: "default-bucket",
        Key: "file.txt",
      });
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it("should generate presigned URL for specified bucket", async () => {
      await s3Service.getPresignedUrl("file.txt", 3600, "custom-bucket");

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: "custom-bucket",
        Key: "file.txt",
      });
    });
  });

  describe("getClient", () => {
    it("should return S3Client instance", () => {
      const client = s3Service.getClient();
      expect(client).toBeDefined();
    });
  });

  describe("getDefaultBucket", () => {
    it("should return default bucket name", () => {
      const bucket = s3Service.getDefaultBucket();
      expect(bucket).toBe("default-bucket");
    });
  });
});
