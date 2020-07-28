/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import { TurtleExporter } from "../TurtleExporter";
import { TestUtils } from "./TestUtils";

describe("TurtleExporter", () => {
  before(async () => {
    await IModelHost.startup();
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("export", () => {
    const outputFileName = TestUtils.initOutputFile("turtle.txt");
    let iModelDb: SnapshotDb;
    if (true) {
      const iModelFileName = TestUtils.initOutputFile("turtle-test.bim");
      iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Test" }, createClassViews: true });
    } else {
      iModelDb = SnapshotDb.openFile("D:/src/imodeljs/core/backend/lib/test/output/IModelTransformer/TestIModelTransformer-Source.bim");
    }
    TurtleExporter.export(iModelDb, outputFileName);
    iModelDb.close();
  });
});
