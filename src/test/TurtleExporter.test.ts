/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import { TurtleExporter } from "../export/TurtleExporter";
import { TestUtils } from "./TestUtils";

describe("TurtleExporter", () => {
  before(async () => {
    await IModelHost.startup();
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("export", () => {
    const outputFileName = TestUtils.initOutputFile("TurtleExporter.txt");
    const iModelFileName = TestUtils.initOutputFile("TurtleExporter.bim");
    const iModelDb: SnapshotDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Test" }, createClassViews: true });
    TurtleExporter.export(iModelDb, outputFileName);
    iModelDb.close();
  });
});
