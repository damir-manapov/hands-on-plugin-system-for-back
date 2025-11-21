import { Module } from "@nestjs/common";
import { PluginManagerService } from "./plugin-manager.service.js";
import { S3Module } from "../services/s3/s3.module.js";
import { DatabaseModule } from "../services/database/database.module.js";
import { KafkaModule } from "../services/kafka/kafka.module.js";

@Module({
  imports: [S3Module, DatabaseModule, KafkaModule],
  providers: [PluginManagerService],
  exports: [PluginManagerService],
})
export class PluginSystemModule {}
