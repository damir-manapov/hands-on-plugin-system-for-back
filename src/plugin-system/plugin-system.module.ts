import { Module } from "@nestjs/common";
import { PluginManagerService } from "./plugin-manager.service.js";

@Module({
  providers: [PluginManagerService],
  exports: [PluginManagerService],
})
export class PluginSystemModule {}
