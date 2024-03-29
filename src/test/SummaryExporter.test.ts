/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb } from "@itwin/core-backend";
import { SummaryExporter } from "../export/SummaryExporter";
import { TestUtils } from "./TestUtils";

describe("SummaryExporter", () => {
  before(async () => {
    await IModelHost.startup();
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("export", async () => {
    const outputFileName = TestUtils.initOutputFile("SummaryExporter.txt");
    const iModelFileName = TestUtils.initOutputFile("SummaryExporter.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "SummaryExporter Test" }, createClassViews: true });
    await SummaryExporter.export(iModelDb, outputFileName);
    iModelDb.close();
  });
});
