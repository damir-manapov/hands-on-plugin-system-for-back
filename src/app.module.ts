import { Module } from "@nestjs/common";
import { PluginSystemModule } from "./plugin-system/plugin-system.module.js";

@Module({
  imports: [PluginSystemModule],
})
export class AppModule {}
