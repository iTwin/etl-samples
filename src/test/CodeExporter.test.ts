/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb, SpatialCategory } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { CodeExporter } from "../export/CodeExporter";
import { TestUtils } from "./TestUtils";

describe("CodeExporter", () => {
  before(async () => {
    await IModelHost.startup();
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("exportCodes", () => {
    const outputFileName = TestUtils.initOutputFile("CodeExporter.csv");
    const iModelFileName = TestUtils.initOutputFile("CodeExporter.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "CodeExporter Test" }, createClassViews: true });
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory1", {});
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory2", {});
    CodeExporter.exportCodes(iModelDb, outputFileName);
    iModelDb.close();
  });
});
