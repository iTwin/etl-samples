import { Logger, LogLevel } from "@itwin/core-bentley";
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BackendLoggerCategory, IModelHost, SnapshotDb } from "@itwin/core-backend";
import { ElementPropertyExporter } from "../export/ElementPropertyExporter";
import { TestUtils } from "./TestUtils";

describe("ElementPropertyExporter", () => {
  before(async () => {
    await IModelHost.startup();
    // optionally initialize logging
    if (false) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(BackendLoggerCategory.IModelExporter, LogLevel.Trace);
    }
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it.skip("should export element properties", () => {
    const outputFileName = TestUtils.initOutputFile("ElementPropertyExporter.json");
    const iModelFileName = ""; // NOTE: replace with path to snapshot iModel
    const iModelDb = SnapshotDb.openFile(iModelFileName);
    ElementPropertyExporter.export(iModelDb, outputFileName);
    iModelDb.close();
  });
});
