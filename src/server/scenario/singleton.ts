import { SqliteScenarioRepository } from "@/repositories/scenario";
import { ScenarioService } from "./service";

let service: ScenarioService | undefined;
export function getScenarioService(): ScenarioService {
  service ??= new ScenarioService(new SqliteScenarioRepository());
  return service;
}

