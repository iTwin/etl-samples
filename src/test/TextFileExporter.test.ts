/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb, SpatialCategory } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { TextFileExporter } from "../export/TextFileExporter";
import { TestUtils } from "./TestUtils";

describe("TextFileExporter", () => {
  before(async () => {
    await IModelHost.startup();
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("export", () => {
    const outputFileName = TestUtils.initOutputFile("TextFileExporter.txt");
    const iModelFileName = TestUtils.initOutputFile("TextFileExporter.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "TextFileExporter Test" }, createClassViews: true });
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory1", {});
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory2", {});
    TextFileExporter.export(iModelDb, outputFileName);
    iModelDb.close();
  });
});
